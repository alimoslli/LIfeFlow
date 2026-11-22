import { addDaysStr, formatIn, localTimeOf, todayIn } from "@/lib/dates";
import { headsUpMinutes, headsUpPush } from "@/lib/heads-up";
import type { UserPreferences } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { busyAgenda } from "./calendar";
import { inQuietHours, jarvisSettings } from "./proactive/engine";
import { listSubscriptions, sendOnce, type Sender } from "./push";

/**
 * The heads-up before something starts (owner, 2026-11-22, the ADHD helps, item 2; lib/heads-up.ts): a push the person's
 * own minutes before a class, shift, meeting or exam that has a time. Never an all-day item or a deadline, never a made-up
 * travel time. Once per thing (`heads-up:<agenda key>`), quiet hours and the per-kind mute apply, off with
 * Settings › Notifications. Run every 5 minutes by `/api/cron/stars`. Returns how many were sent.
 */
export async function pushHeadsUp(scope: UserScope, tz: string, prefs: UserPreferences | undefined, send: Sender, now = new Date()) {
  const minutes = headsUpMinutes(prefs);
  if (!minutes) return 0;
  const s = jarvisSettings(prefs);
  if (s.pushLimit <= 0 || s.mutedKinds.includes("heads_up") || inQuietHours(localTimeOf(now, tz), s.quietStart, s.quietEnd)) return 0;
  const until = now.getTime() + minutes * 60_000;
  const today = todayIn(tz, now);
  const items = (await busyAgenda(scope, tz, today, addDaysStr(today, 1), { now }))
    .filter((i) => i.blocksTime && !i.allDay && !i.done && i.startsAt.getTime() > now.getTime() && i.startsAt.getTime() <= until)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (!items.length || !(await listSubscriptions(scope)).length) return 0;
  let sent = 0;
  for (const i of items) {
    const title = i.origin === "shift" ? i.title.replace(/^Work · /, "") : i.title;
    const msg = headsUpPush({ title, clock: formatIn(i.startsAt, tz, "h:mm a"), location: i.location }, (i.startsAt.getTime() - now.getTime()) / 60_000);
    if (await sendOnce(scope, `heads-up:${i.key}`, { ...msg, url: "/", tag: `lf-heads-up:${i.key}` }, send)) sent++;
  }
  return sent;
}
