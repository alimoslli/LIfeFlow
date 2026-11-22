import type { UserPreferences } from "@/server/db/schema";

/**
 * The heads-up before a class, shift or meeting starts (owner, 2026-11-22, the ADHD helps, item 2): the person's own
 * minutes, never a made-up travel time. Settings › Notifications picks one of these; 0 turns it off.
 */
export const HEADS_UP_CHOICES = [0, 10, 15, 30, 45] as const;
export const HEADS_UP_DEFAULT = 15;

export function headsUpMinutes(prefs: Pick<UserPreferences, "notifications"> | null | undefined): number {
  const m = prefs?.notifications?.headsUp;
  return typeof m === "number" && (HEADS_UP_CHOICES as readonly number[]).includes(m) ? m : HEADS_UP_DEFAULT;
}
