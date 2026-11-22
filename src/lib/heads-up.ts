import { headsUpBody } from "./reminder-words";
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

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * "Bio 101 at 10:00 AM" / "In 15 minutes, Hall 201. Time to wrap up." Calm, no pressure words, the place only when the
 * calendar has one. `clock` is already in the person's time zone.
 */
export function headsUpPush(item: { title: string; clock: string; location?: string | null }, minutesLeft: number, turn = 0): { title: string; body: string } {
  const mins = Math.max(1, Math.round(minutesLeft));
  const place = item.location?.trim() ? `, ${cut(item.location.trim(), 40)}` : "";
  // the words rotate so it isn't tuned out (lib/reminder-words.ts)
  return { title: `${cut(item.title, 48)} at ${item.clock}`, body: headsUpBody(mins, place, turn) };
}
