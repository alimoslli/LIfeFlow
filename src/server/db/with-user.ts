import { sql } from "drizzle-orm";
import { getDb, type Database } from "./client";

/** A transaction handle scoped to one user. All service functions take this. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type UserScope = { tx: Tx; userId: string };

/**
 * Run `fn` in a transaction where Postgres row-level security only exposes
 * `userId`'s rows. Services still filter by user_id explicitly (defence in
 * depth), but this guarantees isolation even if a query forgets to.
 */
export async function withUser<T>(userId: string, fn: (scope: UserScope) => Promise<T>, db: Database = getDb()): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("withUser: invalid user id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn({ tx, userId });
  });
}
