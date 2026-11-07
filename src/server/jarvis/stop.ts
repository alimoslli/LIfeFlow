import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { rateLimitBuckets } from "../db/schema";

/**
 * The Stop button. A dropped connection (screen lock, background, bad signal) never stops a turn; only this does.
 * A stop is one short-lived row in the existing `rate_limit_buckets` table, keyed by the user and the id the app made for
 * that send (`clientMessageId`), so it needs no time comparison: it can arrive before the turn exists, before the chat
 * is saved, or late, and it can only ever affect that one turn. Every server instance sees it; the purge removes old ones.
 */
const key = (userId: string, clientMessageId: string) => `jarvis:stop:${userId}:${clientMessageId}`;

export async function requestStop(userId: string, clientMessageId: string): Promise<void> {
  await getDb()
    .insert(rateLimitBuckets)
    .values({ key: key(userId, clientMessageId), windowStart: new Date(), count: 1 })
    .onConflictDoNothing();
}

/** Has the user pressed Stop for this send? */
export async function stopRequested(userId: string, clientMessageId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ c: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.key, key(userId, clientMessageId)))
    .limit(1);
  return rows.length > 0;
}
