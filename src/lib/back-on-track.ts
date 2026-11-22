/**
 * "Back on track" (owner, 2026-11-22, the ADHD helps, item 3; docs/backlog/2026-11-22-adhd-six.md): to-dos whose time
 * passed are spread across free time in the next days, never piled on one day. Placement is ours, from real free time
 * (busy time comes from `busyAgenda`), and the words never say "overdue", "missed" or how long it's been.
 */
import { formatIn, localDateOf, relativeDayLabel } from "./dates";

/** Today and the next two days. */
export const BACK_DAYS = 3;
/** At most this many land on one day, so no day gets the whole pile. */
export const BACK_PER_DAY = 2;
/** Room each one gets in a free gap. */
export const BACK_MINUTES = 30;
/** At most this many move in one tap. */
export const BACK_MAX = 5;

type Slot = { startsAt: Date; endsAt: Date };

/** Each item gets the start of its own 30 minutes inside a free gap, days in order, at most 2 a day. Items that don't fit stay. */
export function spread<T>(items: T[], days: Slot[][], perDay = BACK_PER_DAY, minutes = BACK_MINUTES): { item: T; at: Date }[] {
  const out: { item: T; at: Date }[] = [];
  const step = minutes * 60_000;
  let i = 0;
  for (const slots of days) {
    let today = 0;
    for (const s of slots) {
      let at = s.startsAt.getTime();
      while (i < items.length && today < perDay && at + step <= s.endsAt.getTime()) {
        out.push({ item: items[i++], at: new Date(at) });
        today++;
        // one per gap when the day has more gaps, so they don't sit back to back
        at = slots.length > 1 ? Infinity : at + step;
      }
      if (i >= items.length || today >= perDay) break;
    }
    if (i >= items.length) break;
  }
  return out;
}

const short = (t: string) => (t.length > 28 ? `${t.slice(0, 27).trimEnd()}…` : t);

/** "Laundry today at 4:00 PM, Email Prof Lee tomorrow at 10:00 AM and 1 more". */
export function spreadLine(moves: { title: string; at: Date }[], tz: string, today: string): string {
  const day = (d: Date) => {
    const l = relativeDayLabel(localDateOf(d, tz), today);
    return l === "Today" || l === "Tomorrow" ? l.toLowerCase() : `on ${l}`;
  };
  const named = moves.slice(0, 2).map((m) => `${short(m.title)} ${day(m.at)} at ${formatIn(m.at, tz, "h:mm a")}`);
  const more = moves.length - named.length;
  if (!more) return named.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${named.join(", ")} and ${more} more`;
}
