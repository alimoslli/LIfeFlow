import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { rateLimitBuckets } from "./db/schema";

/**
 * Fixed-window limiter stored in Postgres, so it works across server
 * instances (serverless included). Returns whether the call is allowed.
 */
export async function rateLimit(db: Database, key: string, limit: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}

/** The count in the current window, without adding to it (so a caller can count only what really happened). */
export async function rateLimitCount(db: Database, key: string, windowSeconds: number): Promise<number> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await db
    .select({ count: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, key), eq(rateLimitBuckets.windowStart, windowStart)));
  return row?.count ?? 0;
}

export async function purgeOldRateLimits(db: Database) {
  // About a day, as the privacy page says. Every counter has a window of a day or less, so one whose window started more than a day
  // ago is finished (a counter in use has a recent window and stays). Only the monthly testing counters need their month.
  await db
    .delete(rateLimitBuckets)
    .where(
      sql`${rateLimitBuckets.windowStart} < now() - interval '1 day' and ${rateLimitBuckets.key} !~ '^jarvis:cont:' and ${rateLimitBuckets.key} !~ '-month:'`,
    );
  await db.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.windowStart} < now() - interval '31 days' and ${rateLimitBuckets.key} ~ '-month:'`);
  // Stop requests only matter while their turn runs (at most a few minutes).
  await db.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.key} ~ '^jarvis:stop:' and ${rateLimitBuckets.windowStart} < now() - interval '10 minutes'`);
  // Continuation marks keep their time (in seconds) in the count; their window is fixed.
  await db.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.key} ~ '^jarvis:cont:' and ${rateLimitBuckets.count} < extract(epoch from now()) - 600`);
}
