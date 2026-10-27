import { sql } from "drizzle-orm";
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

export async function purgeOldRateLimits(db: Database) {
  await db.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.windowStart} < now() - interval '1 day'`);
}
