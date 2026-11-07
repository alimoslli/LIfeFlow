import { and, eq, gte } from "drizzle-orm";
import { getDb } from "../db/client";
import { rateLimitBuckets } from "../db/schema";
import { withUser } from "../db/with-user";
import { getConversation } from "./conversations";

/**
 * The Stop button. A dropped connection (screen lock, background, bad signal) never stops a turn; only this does.
 * A stop is one short-lived row in the existing `rate_limit_buckets` table (key per user and conversation, window start =
 * when Stop was pressed), which every server instance can see. The agent looks for one newer than its own start
 * between steps; old rows are purged with the other buckets.
 */
const key = (userId: string, conversationId: string) => `jarvis:stop:${userId}:${conversationId}`;

/** Records a stop for one of the user's own conversations. Throws "not found" for anyone else's. */
export async function requestStop(userId: string, conversationId: string): Promise<void> {
  await withUser(userId, (s) => getConversation(s, conversationId));
  await getDb()
    .insert(rateLimitBuckets)
    .values({ key: key(userId, conversationId), windowStart: new Date(), count: 1 })
    .onConflictDoNothing();
}

/** Has the user pressed Stop for this conversation since `since`? */
export async function stopRequested(userId: string, conversationId: string, since: Date): Promise<boolean> {
  const rows = await getDb()
    .select({ c: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, key(userId, conversationId)), gte(rateLimitBuckets.windowStart, since)))
    .limit(1);
  return rows.length > 0;
}
