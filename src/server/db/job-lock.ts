import { getPool } from "./client";

/**
 * Non-blocking, per-job lock (Postgres session advisory lock) so a second overlapping run of a cron job or webhook
 * handler exits early instead of double-sending or double-writing. Returns `{ skipped: true }` when another run holds it.
 * The lock lives on one dedicated connection and is always released in `finally`; if the process dies the connection
 * closes and Postgres frees the lock. The key is derived from the name, so any string works.
 */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const client = await getPool().connect();
  let held = false;
  try {
    const r = await client.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext($1)) as ok", [`lifeflow:${name}`]);
    held = r.rows[0]?.ok === true;
    if (!held) return { skipped: true };
    return { skipped: false, value: await fn() };
  } finally {
    if (held) await client.query("select pg_advisory_unlock(hashtext($1))", [`lifeflow:${name}`]).catch(() => undefined);
    client.release();
  }
}
