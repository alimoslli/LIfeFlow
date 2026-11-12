import { randomUUID } from "node:crypto";
import { inArray, like, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { getDb, type Database } from "../db/client";
import { aiBudgets } from "../db/schema";

/**
 * Setting AI cost and use aside before the work starts (ADR 0035). The check and the set-aside are one SQL function
 * (ai_reserve, migration 0067) on its own short connection, never inside the person's own transaction, so a rollback
 * can't erase a hold for work that ran and requests running at the same time can't all pass the same limit.
 */

export type BudgetKind = "micros" | "count" | "seconds";
export type BudgetLine = {
  /** "u:<user>:<period>:<what>" per person, "g:<period>:<what>" for the whole company. */
  key: string;
  kind: BudgetKind;
  /** How much to set aside (micro-dollars, a count, or seconds). */
  amount: number;
  /** The most this counter may reach (used + held + amount); null only counts. */
  limit: number | null;
};

export type Reservation = { ok: true; holdId: string | null } | { ok: false; key: string };

const poolOf = (db: Database) => (db as unknown as { $client: Pool }).$client;
const whole = (n: number) => Math.max(0, Math.round(n));

/** Reserves every line or none. `ttlSeconds` is how long the hold lives if nobody settles it (a crash): then it counts as used. */
export async function reserveBudget(lines: BudgetLine[], ttlSeconds: number, opts: { holdId?: string; db?: Database } = {}): Promise<Reservation> {
  if (!lines.length) return { ok: true, holdId: null };
  const holdId = opts.holdId ?? randomUUID();
  const { rows } = await poolOf(opts.db ?? getDb()).query<{ r: string | null }>(
    "select ai_reserve($1::uuid, $2::text[], $3::text[], $4::bigint[], $5::bigint[], $6::int) as r",
    [
      holdId,
      lines.map((l) => l.key),
      lines.map((l) => l.kind),
      lines.map((l) => whole(l.amount)),
      lines.map((l) => (l.limit == null ? null : whole(l.limit))),
      Math.max(1, Math.round(ttlSeconds)),
    ],
  );
  return rows[0].r ? { ok: false, key: rows[0].r } : { ok: true, holdId };
}

/** Settles a hold with what really happened (null = unknown: the estimate stays counted). True the first time, false for a repeat. */
export async function settleBudget(holdId: string, actual: { micros?: number | null; seconds?: number | null } = {}, db: Database = getDb()): Promise<boolean> {
  const { rows } = await poolOf(db).query<{ r: boolean }>("select ai_settle($1::uuid, $2::bigint, $3::bigint) as r", [
    holdId,
    actual.micros == null ? null : whole(actual.micros),
    actual.seconds == null ? null : whole(actual.seconds),
  ]);
  return rows[0].r;
}

/** Gives a hold back without counting it (the provider refused before doing any work). */
export async function releaseBudget(holdId: string, db: Database = getDb()): Promise<boolean> {
  const { rows } = await poolOf(db).query<{ r: boolean }>("select ai_release($1::uuid) as r", [holdId]);
  return rows[0].r;
}

/** Counts holds that expired more than a minute ago as used. Returns how many it released. */
export async function sweepBudgets(db: Database = getDb()): Promise<number> {
  const { rows } = await poolOf(db).query<{ r: number }>("select ai_sweep() as r");
  return rows[0].r;
}

export type BudgetReading = { used: number; held: number };

/** What the counters say right now (read only, never changes a counter). Missing keys read as zero. */
export async function readBudgets(keys: string[], db: Database = getDb()): Promise<Map<string, BudgetReading>> {
  const out = new Map<string, BudgetReading>(keys.map((k) => [k, { used: 0, held: 0 }]));
  if (!keys.length) return out;
  const rows = await db.select().from(aiBudgets).where(inArray(aiBudgets.key, keys));
  for (const r of rows) out.set(r.key, { used: r.used, held: r.held });
  return out;
}

/** Removes a deleted account's counters. */
export async function deleteUserBudgets(userId: string, db: Database = getDb()) {
  await db.delete(aiBudgets).where(like(aiBudgets.key, `u:${userId}:%`));
}

/** Counters untouched for 13 months (and with nothing set aside) are removed. */
export async function purgeOldBudgets(db: Database = getDb()) {
  await db.delete(aiBudgets).where(sql`${aiBudgets.updatedAt} < now() - interval '13 months' and ${aiBudgets.held} = 0`);
}
