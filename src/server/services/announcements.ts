import { and, desc, gt, isNull, lte, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { announcements } from "../db/schema";

export type ActiveAnnouncement = { id: string; message: string; tone: "info" | "warning"; linkUrl: string | null };

/** The newest announcement showing right now, if any (shown as a banner in the app). Never throws. */
export async function activeAnnouncement(db: Database, now = new Date()): Promise<ActiveAnnouncement | null> {
  try {
    const [a] = await db
      .select({ id: announcements.id, message: announcements.message, tone: announcements.tone, linkUrl: announcements.linkUrl })
      .from(announcements)
      .where(and(lte(announcements.startsAt, now), or(isNull(announcements.endsAt), gt(announcements.endsAt, now))))
      .orderBy(desc(announcements.startsAt))
      .limit(1);
    return a ?? null;
  } catch {
    return null;
  }
}
