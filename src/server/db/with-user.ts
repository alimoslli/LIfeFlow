import { sql } from "drizzle-orm";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import { getDb, type Database } from "./client";

/** A transaction handle scoped to one user. All service functions take this. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type UserScope = {
  tx: Tx;
  userId: string;
  /** Reads already asked for in this render, when the page chose to share them (`readOnce`). Never set while saving. */
  memo?: Map<string, Promise<unknown>>;
};

/**
 * For a page that only reads (Today): the same base read asked for again in this render (the bills, the categories, the
 * 13 months of transactions the recurring detection works from) is answered from the first time, instead of going to the
 * database once per caller. Today asked for the same rows 5 to 12 times. Only ever turn it on in a render that doesn't
 * write what it reads; actions and crons never do, so a save always reads fresh rows.
 */
export function readOnce(scope: UserScope): UserScope {
  scope.memo ??= new Map();
  return scope;
}

/** A caller's own copy: arrays (and the arrays inside a plain result) are copied, so one caller sorting can't reorder another's. */
function ownCopy<T>(v: T): T {
  if (Array.isArray(v)) return [...v] as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? [...x] : x])) as T;
  return v;
}

/**
 * `read` once per render for `key` when the scope shares reads (`readOnce`); otherwise just `read`. A read that failed is
 * asked again by the next caller.
 */
export function once<T>(scope: UserScope, key: string, read: () => Promise<T>): Promise<T> {
  const memo = scope.memo;
  if (!memo) return read();
  let hit = memo.get(key) as Promise<T> | undefined;
  if (!hit) {
    // a real promise: a query builder runs again every time it is awaited, so the builder itself can't be what's kept
    hit = (async () => read())();
    memo.set(key, hit);
    hit.catch(() => memo.delete(key));
  }
  return hit.then(ownCopy);
}

/**
 * Run `fn` in a transaction where Postgres row-level security only exposes
 * `userId`'s rows. Services still filter by user_id explicitly (defence in
 * depth), but this guarantees isolation even if a query forgets to.
 * `config` sets the transaction's isolation and access (the data export reads one read-only snapshot).
 */
export async function withUser<T>(userId: string, fn: (scope: UserScope) => Promise<T>, db: Database = getDb(), config?: PgTransactionConfig): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("withUser: invalid user id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn({ tx, userId });
  }, config);
}
