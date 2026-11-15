import { eq, max } from "drizzle-orm";
import type { Database } from "../db/client";
import { integrations, sessions } from "../db/schema";
import type { UserScope } from "../db/with-user";

/**
 * Accounts that stopped opening the app (owner, 2026-11-15: "pause after 7 days and refresh every 3 days"). After 7 days
 * without the app being opened, the background work that costs money waits: no paid AI on their behalf (the morning Gmail
 * filing), and their connections sync every 3 days instead of every half hour. Nothing is lost and nothing is asked of
 * them: the moment they open the app they are seen again, and the next run is back to normal. Notifications are not
 * paused; they are how the skyling brings people back.
 *
 * "Opened" is the newest `sessions.last_seen_at` (stamped every 10 minutes of use), or when the account was made if it has
 * no session left.
 */
export const IDLE_AFTER_DAYS = 7;
export const IDLE_SYNC_EVERY_DAYS = 3;
const DAY = 86_400_000;

export const isIdle = (lastSeen: Date | null | undefined, createdAt: Date, now = new Date()) =>
  (lastSeen ?? createdAt).getTime() < now.getTime() - IDLE_AFTER_DAYS * DAY;

/** When each account's app was last open (accounts with no session left are not in the map). */
export async function lastSeenByUser(db: Database): Promise<Map<string, Date>> {
  const rows = await db
    .select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
    .from(sessions)
    .groupBy(sessions.userId);
  return new Map(rows.flatMap((r) => (r.at ? [[r.userId, r.at] as const] : [])));
}

/** One account's last opening, for the paths that handle a single account (a bank's webhook). */
export async function lastSeenOf(db: Database, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(sessions.lastSeenAt) })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return row?.at ?? null;
}

/** An idle account's connection is due when it has never synced, or last synced 3 or more days ago. */
export async function idleSyncDue(scope: UserScope, integrationId: string, now = new Date()): Promise<boolean> {
  const [row] = await scope.tx.select({ at: integrations.lastSyncedAt }).from(integrations).where(eq(integrations.id, integrationId));
  return !row?.at || row.at.getTime() <= now.getTime() - IDLE_SYNC_EVERY_DAYS * DAY;
}
