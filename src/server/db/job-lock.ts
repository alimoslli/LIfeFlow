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
 * `alertAfterSkips`: after that many skipped runs in a row, one fixed-text error report is recorded (cron jobs only).
 */
export const DEFAULT_LEASE_MS = 310_000;

export async function withJobLock<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; alertAfterSkips?: number; route?: string } = {},
): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const db = getDb();
  const holder = randomUUID();
  const ttlMs = opts.ttlMs ?? DEFAULT_LEASE_MS;
  const claimed = await db.execute<{ holder: string }>(sql`
    insert into job_locks (name, holder, expires_at, skips)
    values (${name}, ${holder}, now() + ${ttlMs} * interval '1 millisecond', 0)
    on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at, skips = 0
    where job_locks.expires_at < now()
    returning holder`);
  if (claimed.rows[0]?.holder !== holder) {
    if (opts.alertAfterSkips) await noteSkip(name, opts.alertAfterSkips, opts.route ?? "/api/cron").catch(() => undefined);
    return { skipped: true };
  }
  try {
    return { skipped: false, value: await fn() };
  } finally {
    await releaseJobLock(name, holder).catch(() => undefined); // a failed release just lets the lease expire
  }
}

/** Frees a lease, but only if we still hold it (an expired one may already belong to a newer run). */
export async function releaseJobLock(name: string, holder: string) {
  await getDb().execute(sql`delete from job_locks where name = ${name} and holder = ${holder}`);
}

/** One Plaid sync per connection at a time (cron, webhook and user-triggered runs share it). Fits the 60 s routes. */
export const withPlaidSyncLock = <T>(integrationId: string, fn: () => Promise<T>) => withJobLock(`plaid-sync:${integrationId}`, fn, { ttlMs: 90_000 });

async function noteSkip(name: string, after: number, route: string) {
  const r = await getDb().execute<{ skips: number }>(sql`update job_locks set skips = skips + 1 where name = ${name} returning skips`);
  if (r.rows[0]?.skips === after) {
    await recordError(getDb(), {
      source: "server",
      route,
      message: `A scheduled job was skipped ${after} runs in a row because the previous run is still working.`,
    });
  }
}
