import { getPool } from "./client";

/**
 * Non-blocking, per-job lock so a second overlapping run of a cron job or webhook handler exits early instead of
 * double-sending or double-writing. Returns `{ skipped: true }` when another run holds it.
 *
 * It is a transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) held in an open transaction on one dedicated
 * connection for the length of the job. That works behind a transaction-mode pooler (ADR 0003), where a session lock
 * and its unlock could land on different server connections and leave a lock stuck. Commit or rollback (or the
 * connection dying) always frees it. The job itself runs on other connections; this one only holds the lock.
 */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const client = await getPool().connect();
  let broken = false;
  try {
    await client.query("begin");
    const r = await client.query<{ ok: boolean }>("select pg_try_advisory_xact_lock(hashtext($1)) as ok", [`lifeflow:${name}`]);
    if (r.rows[0]?.ok !== true) return { skipped: true };
    return { skipped: false, value: await fn() };
  } finally {
    await client.query("rollback").catch(() => {
      broken = true;
    });
    client.release(broken);
  }
}
