import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { recordError } from "../services/error-reports";

/**
 * Non-blocking, per-job lease so a second overlapping run of a cron job or webhook handler exits early instead of
 * double-sending or double-writing. Returns `{ skipped: true }` when another run holds a live lease.
 *
 * The lease is a row in `job_locks` claimed with one statement (insert, or take over only an expired row) and released
 * with a delete that matches our own holder id. No connection is held while the job runs, so a burst of locked jobs can
 * never starve the pool, and a crashed or killed run just lets its lease expire after `ttlMs` (default just over the
 * 300 s route limit). Works the same behind a transaction-mode pooler (ADR 0003).
 *
 * Taking over an expired row means an earlier run died or overran: one fixed-text error report is recorded.
 *
 * `rerun`: for work that must not be lost when a request is skipped (a Plaid webhook is sent once). A skipped request
 * bumps `skips` (and `live_wanted` if it asked for live data). The holder only frees the lease when `skips = 0`;
 * otherwise it resets the counter, extends the lease and runs `rerun(live)` once more, at most `MAX_EXTRA_ROUNDS` times.
 */
export const DEFAULT_LEASE_MS = 310_000;
export const MAX_EXTRA_ROUNDS = 2;

type Opts = {
  ttlMs?: number;
  route?: string;
  /** Mark skipped requests on the row so the holder runs again before it lets go. */
  rerun?: (live: boolean) => Promise<unknown>;
  /** This request wants live data; recorded on the row if it is skipped. */
  live?: boolean;
  /** Extra rounds only start within this long of the claim (default half the lease), so a route can't be killed mid-round. */
  roundsWithinMs?: number;
};

export async function withJobLock<T>(name: string, fn: () => Promise<T>, opts: Opts = {}): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const db = getDb();
  const holder = randomUUID();
  const ttlMs = opts.ttlMs ?? DEFAULT_LEASE_MS;
  const claim = async () => {
    const r = await db.execute<{ holder: string; took_over: boolean }>(sql`
      insert into job_locks (name, holder, expires_at, skips, live_wanted)
      values (${name}, ${holder}, now() + ${ttlMs} * interval '1 millisecond', 0, false)
      on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at, skips = 0, live_wanted = false
      where job_locks.expires_at < now()
      returning holder, (xmax <> 0) as took_over`);
    return r.rows[0]?.holder === holder ? r.rows[0] : null;
  };
  let claimed = await claim();
  for (let i = 0; !claimed && opts.rerun && i < 2; i++) {
    // Leave a mark for the holder. If the row vanished meanwhile (it just finished), try to claim again.
    const marked = await db.execute(sql`
      update job_locks set skips = skips + 1, live_wanted = live_wanted or ${!!opts.live} where name = ${name} and expires_at >= now()`);
    if (marked.rowCount) break;
    claimed = await claim();
  }
  if (!claimed) return { skipped: true };
  if (claimed.took_over) {
    await recordError(db, { source: "server", route: opts.route ?? "/api/cron", message: `Job lock: ${jobLabel(name)} taken over after an expired run` }).catch(
      () => undefined,
    );
  }
  const started = Date.now();
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await fn() };
  } catch (error) {
    outcome = { ok: false, error };
  }
  // Even after a failed run: a request skipped meanwhile still gets its sync (the next try may well work).
  if (opts.rerun) await rerunWhileAsked(name, holder, ttlMs, opts.rerun, started + (opts.roundsWithinMs ?? ttlMs / 2)).catch(() => undefined);
  // A failed release just lets the lease expire.
  const left = await releaseJobLock(name, holder).catch(() => 0);
  if (left > 0 && opts.rerun) {
    // Out of rounds or time with a request still waiting: the next run (at the latest the 30-minute cron) picks it up.
    await recordError(db, {
      source: "server",
      route: opts.route ?? "/api/cron",
      message: `Job lock: ${jobLabel(name)} left a skipped request to the next run`,
    }).catch(() => undefined);
  }
  if (!outcome.ok) throw outcome.error;
  return { skipped: false, value: outcome.value };
}

const jobLabel = (name: string) => (name.startsWith("plaid-sync:") ? "plaid-sync" : name);

async function rerunWhileAsked(name: string, holder: string, ttlMs: number, rerun: (live: boolean) => Promise<unknown>, startBefore: number) {
  const db = getDb();
  for (let round = 0; round < MAX_EXTRA_ROUNDS && Date.now() < startBefore; round++) {
    const freed = await db.execute(sql`delete from job_locks where name = ${name} and holder = ${holder} and skips = 0 returning name`);
    if (freed.rows.length) return;
    // Someone asked while we were running: take the request, keep the lease, and go once more.
    const asked = await db.execute<{ live: boolean }>(sql`
      update job_locks j set skips = 0, live_wanted = false, expires_at = now() + ${ttlMs} * interval '1 millisecond'
      from (select name, live_wanted from job_locks where name = ${name} and holder = ${holder} for update) o
      where j.name = o.name
      returning o.live_wanted as live`);
    if (!asked.rows.length) return; // the lease is no longer ours
    await rerun(!!asked.rows[0].live).catch(() => undefined);
  }
}

/**
 * Frees a lease, but only if we still hold it (an expired one may already belong to a newer run). Returns how many
 * skipped requests were still waiting on it (0 when nothing was left, or the lease wasn't ours).
 */
export async function releaseJobLock(name: string, holder: string): Promise<number> {
  const r = await getDb().execute<{ skips: number }>(sql`delete from job_locks where name = ${name} and holder = ${holder} returning skips`);
  return Number(r.rows[0]?.skips ?? 0);
}

/**
 * One Plaid sync per connection at a time (cron, webhook and user-triggered runs share it). A request skipped meanwhile
 * makes the holder sync once more before letting go, with live balances if any skipped request wanted them.
 * `run(live)` does the sync. `maxMs` is the calling route's own time limit (60 s for webhook, Sync now and connect;
 * 300 s for the cron and the assistant): the lease is just over it, so a run the platform kills frees within seconds of
 * its limit, and extra rounds only start in the first half of it.
 */
export const withPlaidSyncLock = <T>(integrationId: string, run: (live: boolean) => Promise<T>, opts: { live?: boolean; maxMs?: number } = {}) => {
  const maxMs = opts.maxMs ?? PLAID_ROUTE_MS;
  return withJobLock(`plaid-sync:${integrationId}`, () => run(!!opts.live), {
    ttlMs: maxMs + 10_000,
    roundsWithinMs: maxMs / 2,
    live: opts.live,
    rerun: (live) => run(live),
    route: "/api/integrations/plaid",
  });
};

/** The webhook, Sync now and connect routes' `maxDuration`. */
export const PLAID_ROUTE_MS = 60_000;
