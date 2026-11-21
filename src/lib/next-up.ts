import { addDaysStr, formatIn, localDateOf, startOfLocalDay, todayIn } from "@/lib/dates";

/**
 * Today's note is the next real thing in the next 24 hours (owner, 2026-11-16, item 1 of the Today list): due tonight,
 * the next class, a shift, a meeting, a pitch or a delivery, from any source. Time order wins: a later thing never
 * outranks one in the next 24 hours (research 2026-11-16, "Things to avoid" 2). Something farther off is said only when
 * nothing is closer, and that is the caller's old note.
 */
export type NextUpItem = {
  key: string;
  origin: "event" | "shift" | "assignment" | "task";
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  kind: string;
  href: string;
  blocksTime: boolean;
  /** an event the person tagged as work (client meetings, shoots) */
  work?: boolean;
  /** an assignment's course code or name, said before its title ("ECON 257 Quiz 10") */
  subtitle?: string | null;
  /** where a class or meeting happens, said after its time ("BIO 418 at 12:00 PM, Arts 247") */
  location?: string | null;
  /** a hand-in the person ticked done: never next, never due */
  done?: boolean;
};

/** `dues` are the deadlines the line names: every one due in the same part of the day as the one it says (the test
 * student had three quizzes due tonight and saw one, without its class). */
export type NextUp = { item: NextUpItem; state: "next" | "now"; due: boolean; also: NextUpItem | null; dues: NextUpItem[] };

export const NEXT_UP_HOURS = 24;

/**
 * An all-day calendar day that is a hand-in, not a holiday: "Deliver the Rivera gallery", "Logo due", "Final files to
 * Acme" (owner, 2026-11-16, item 6: client deliveries count as due). Everything else all-day (birthdays, trips) is not.
 */
export function isDueEvent(title: string) {
  return /\b(deliver(y|ies|ed|ing)?|due|deadline|hand[- ]?(in|off)|submit|send (the )?(final|files|gallery|proofs))\b/i.test(title);
}

/** Deadlines (assignments, to-dos and all-day deliveries) are points in time; everything else blocks time. */
const isDeadline = (i: NextUpItem) => i.origin === "assignment" || i.origin === "task" || (i.origin === "event" && i.allDay && isDueEvent(i.title));

/** When a deadline really is: an all-day one is due by the end of its day. */
function dueBy(i: NextUpItem, tz: string) {
  return i.allDay ? startOfLocalDay(addDaysStr(localDateOf(i.startsAt, tz), 1), tz) : i.startsAt;
}

export function pickNextUp(all: NextUpItem[], now: Date, tz: string): NextUp | null {
  const items = all.filter((i) => !i.done);
  const end = now.getTime() + NEXT_UP_HOURS * 3_600_000;
  const t = now.getTime();
  const deadlines = items
    .filter(isDeadline)
    .filter((i) => dueBy(i, tz).getTime() > t && (i.allDay ? i.startsAt.getTime() : dueBy(i, tz).getTime()) < end)
    .sort((a, b) => dueBy(a, tz).getTime() - dueBy(b, tz).getTime());
  const timed = items
    .filter((i) => !isDeadline(i) && !i.allDay && i.blocksTime)
    .filter((i) => i.startsAt.getTime() < end && (i.endsAt ?? i.startsAt).getTime() > t)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const upcoming = timed.filter((i) => i.startsAt.getTime() > t);
  // the soonest coming thing, a deadline or a block, in plain time order; an all-day delivery counts from its morning
  const when = (i: NextUpItem) => (isDeadline(i) ? (i.allDay ? Math.max(i.startsAt.getTime(), t) : i.startsAt.getTime()) : i.startsAt.getTime());
  const first = [...upcoming, ...deadlines].sort((a, b) => when(a) - when(b))[0];
  if (first) {
    const due = isDeadline(first);
    // a deadline later in the 24 hours rides along, so "due tonight" is never hidden behind the next class
    const also = due ? null : (deadlines.find((d) => d !== first) ?? null);
    const said = due ? first : also;
    const dues = said ? deadlines.filter((d) => dueSlot(d, tz, now) === dueSlot(said, tz, now)) : [];
    return { item: first, state: "next", due, also, dues };
  }
  // nothing ahead, but something is on right now (the last shift of the day)
  const live = timed.find((i) => i.startsAt.getTime() <= t);
  return live ? { item: live, state: "now", due: false, also: null, dues: [] } : null;
}

const time = (d: Date, tz: string) => formatIn(d, tz, "h:mm a");

/** The day words for an instant: "", "tonight", "tomorrow" (only ever within the next 24 hours). */
function dayWord(d: Date, tz: string, now: Date) {
  const today = todayIn(tz, now);
  const day = localDateOf(d, tz);
  if (day === today) return Number(formatIn(d, tz, "H")) >= 17 ? "tonight" : "today";
  return "tomorrow";
}

/** "Work · Target" (the agenda's title for a shift) reads as "Target shift"; an assignment carries its class. */
function titleOf(i: NextUpItem) {
  if (i.origin === "shift") return `${i.title.replace(/^Work · /, "")} shift`;
  const course = i.origin === "assignment" ? i.subtitle?.trim() : null;
  return course && !i.title.toLowerCase().startsWith(course.toLowerCase()) ? `${course} ${i.title}` : i.title;
}

/** Where a class or meeting is, after its time (test students, 2026-11-16: "put the room in the Next line"); a shift is at
 * its employer already, and a long address is cut at a word so the note stays one or two lines. */
function placeOf(i: NextUpItem) {
  const p = i.origin === "event" ? i.location?.replace(/\s+/g, " ").trim() : "";
  if (!p) return "";
  return `, ${p.length > 40 ? `${p.slice(0, 40).replace(/[\s,]+\S*$/, "")}…` : p}`;
}

/** Which part of the day a deadline is due in, in words: "today", "tonight" or "tomorrow". */
function dueSlot(i: NextUpItem, tz: string, now: Date) {
  const word = dayWord(i.startsAt, tz, now);
  return i.allDay ? (word === "tomorrow" ? "tomorrow" : "today") : word;
}

function deadlineWords(i: NextUpItem, tz: string, now: Date, group: NextUpItem[] = [i]) {
  const slot = dueSlot(i, tz, now);
  if (group.length > 1) {
    const names = group.slice(0, 3).map(titleOf);
    return `Due ${slot}: ${names.join(", ")}${group.length > 3 ? ` and ${group.length - 3} more` : ""}`;
  }
  if (i.allDay) return `${titleOf(i)} due ${slot}`;
  return `${titleOf(i)} due ${slot} ${time(i.startsAt, tz)}`;
}

/** One line, the thing first: "Next: Calculus at 2:00 PM · Lab report due tonight 11:59 PM". */
export function nextUpText(n: NextUp, tz: string, now: Date) {
  const i = n.item;
  let head: string;
  if (n.due) head = deadlineWords(i, tz, now, n.dues);
  else if (n.state === "now") head = `Now: ${titleOf(i)} until ${time(i.endsAt ?? i.startsAt, tz)}${placeOf(i)}`;
  else {
    const word = dayWord(i.startsAt, tz, now);
    head = `Next: ${titleOf(i)} ${word === "tomorrow" ? "tomorrow at" : "at"} ${time(i.startsAt, tz)}${placeOf(i)}`;
  }
  return n.also ? `${head} · ${deadlineWords(n.also, tz, now, n.dues)}` : head;
}

/**
 * Nothing in the next 24 hours: the soonest real thing after that (within the week), said plainly so the note never
 * points at something farther while a nearer one waits (test student p1027, 2026-11-16: at night the note named a quiz
 * four days away while her shift was the day after tomorrow). "Nothing in the next 24 hours · Next: Lab worksheet 12 due
 * Tue 11:59 PM".
 */
export function laterText(items: NextUpItem[], now: Date, tz: string): { text: string; item: NextUpItem } | null {
  const t = now.getTime();
  const later = items
    .filter((i) => !i.done)
    .filter((i) => (isDeadline(i) ? dueBy(i, tz).getTime() > t : !i.allDay && i.blocksTime && i.startsAt.getTime() > t))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (!later) return null;
  const day = formatIn(later.startsAt, tz, "EEE");
  const what = isDeadline(later)
    ? later.allDay
      ? `${titleOf(later)} due ${day}`
      : `${titleOf(later)} due ${day} ${time(later.startsAt, tz)}`
    : `${titleOf(later)} ${day} ${time(later.startsAt, tz)}`;
  return { text: `Nothing in the next 24 hours · Next: ${what}`, item: later };
}

export type WorkShift = { startsAt: Date; endsAt: Date; employer: string };

/**
 * On a day someone usually works, Today says whether they do (owner, 2026-11-18, from a test student who went through
 * More and Work twice to learn she wasn't working): "Work today: Target, 4:00 PM to 9:00 PM", or "No work today" when the
 * weekday is a usual work day (a shift on it in two or more of the last four weeks) and none is on the schedule. Nothing
 * when the note already names the shift, when the day's shift is over, or for someone with no job; never a guess at pay.
 */
export function workDayLine(today: WorkShift[], past: Date[], now: Date, tz: string, note?: string | null): string | null {
  const day = todayIn(tz, now);
  const mine = today.filter((s) => localDateOf(s.startsAt, tz) === day);
  if (mine.length) {
    const left = mine.filter((s) => s.endsAt.getTime() > now.getTime());
    if (!left.length || /\bshift\b/i.test(note ?? "")) return null;
    const s = left[0];
    const meridiem = formatIn(s.startsAt, tz, "a") === formatIn(s.endsAt, tz, "a");
    return `Work today: ${s.employer}, ${formatIn(s.startsAt, tz, meridiem ? "h:mm" : "h:mm a")} to ${formatIn(s.endsAt, tz, "h:mm a")}`;
  }
  const weekday = formatIn(now, tz, "EEE");
  const weeks = new Set(
    past
      .filter((d) => d.getTime() < startOfLocalDay(day, tz).getTime() && d.getTime() >= startOfLocalDay(addDaysStr(day, -28), tz).getTime())
      .filter((d) => formatIn(d, tz, "EEE") === weekday)
      .map((d) => localDateOf(d, tz)),
  );
  return weeks.size >= 2 ? "No work today" : null;
}
