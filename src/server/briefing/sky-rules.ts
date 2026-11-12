import { addDaysStr, daysBetween, formatDateStr, formatIn, localDateOf, localTimeOf, localToInstant } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { AgendaItem } from "../services/calendar";
import type { Insight, LifeSnapshot } from "./types";
import { examLabel } from "@/lib/course-label";

/**
 * The small decisions before you ask (owner, 2026-11-12; docs/backlog/2026-11-12-useful-sky.md, part 2): Tonight from
 * 4 PM, free gaps between booked things, and the maths of the next due date. Pure, from the snapshot only: no AI, no
 * guessed number. Each is live (worked out on every look), never stored or pushed.
 */

const MIN = 60_000;
/** Free time is counted until here: the same bedtime as the `tonight` tool. */
const AWAKE_UNTIL = "23:00";
const DAY_FROM = "08:00";
const GAP_MIN = 45;

const usd = (c: number) => (Math.abs(c) >= 10_000 ? formatCents(Math.round(c / 100) * 100) : formatCents(c)).replace(/\.00$/, "");
/** "9 AM", "3:30 PM": times as people say them. */
export const clock = (d: Date, tz: string) => formatIn(d, tz, "h:mm a").replace(":00 ", " ");
const hm = (d: Date, tz: string) => localTimeOf(d, tz).slice(0, 5);

/** "45 minutes", "1 hour", "2.5 hours": rounded down, so free time is never made to look bigger than it is. */
export function freeWords(minutes: number) {
  if (minutes < 60) return `${Math.floor(minutes / 5) * 5} minutes`;
  const h = Math.floor(minutes / 30) / 2;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** "today 9 PM", "tomorrow 9 AM", "Thursday 11:59 PM". */
export function dueWords(at: Date, s: Pick<LifeSnapshot, "today" | "tz">) {
  const d = daysBetween(s.today, localDateOf(at, s.tz));
  const day = d === 0 ? "today" : d === 1 ? "tomorrow" : formatDateStr(localDateOf(at, s.tz), "EEEE");
  return `${day} ${clock(at, s.tz)}`;
}

/** Booked time (classes, shifts, events) merged into busy stretches, so two overlapping things never count twice. */
function busyStretches(items: AgendaItem[]) {
  const busy = items
    .filter((i) => i.blocksTime && i.endsAt && !i.allDay)
    .map((i) => ({ from: i.startsAt.getTime(), to: i.endsAt!.getTime(), first: i, last: i }))
    .sort((a, b) => a.from - b.from);
  const out: typeof busy = [];
  for (const b of busy) {
    const prev = out[out.length - 1];
    if (prev && b.from <= prev.to) {
      if (b.to > prev.to) Object.assign(prev, { to: b.to, last: b.last });
    } else out.push({ ...b });
  }
  return out;
}

/** Free minutes between two instants, counting only DAY_FROM to AWAKE_UNTIL each day, after booked time. */
export function freeMinutesBetween(s: Pick<LifeSnapshot, "week" | "tz">, from: Date, to: Date) {
  if (to <= from) return { minutes: 0, first: null as { from: Date; to: Date } | null };
  const busy = busyStretches(s.week);
  let minutes = 0;
  let first: { from: Date; to: Date } | null = null;
  for (let d = localDateOf(from, s.tz); d <= localDateOf(to, s.tz); d = addDaysStr(d, 1)) {
    let cursor = Math.max(from.getTime(), localToInstant(d, DAY_FROM, s.tz).getTime());
    const end = Math.min(to.getTime(), localToInstant(d, AWAKE_UNTIL, s.tz).getTime());
    for (const b of [...busy.filter((x) => x.to > cursor && x.from < end), { from: end, to: end }]) {
      const gap = Math.min(b.from, end) - cursor;
      if (gap > 0) {
        minutes += gap / MIN;
        if (!first && gap >= 60 * MIN) first = { from: new Date(cursor), to: new Date(cursor + gap) };
      }
      cursor = Math.max(cursor, b.to);
      if (cursor >= end) break;
    }
  }
  return { minutes: Math.round(minutes), first };
}

/** Quarter-hour rounding up, so a block starts at a time people book ("2:15 PM", never "2:07 PM"). */
const nextQuarter = (t: number) => Math.ceil(t / (15 * MIN)) * 15 * MIN;

const dueBefore = (s: LifeSnapshot, until: Date) =>
  [
    ...(s.due ?? []).map((a) => ({ title: a.title, at: a.dueAt })),
    ...s.exams.map((e) => ({ title: examLabel(e.course || null, e.kind, e.title), at: e.dueAt })),
    ...(s.todos ?? []).map((t) => ({ title: t.title, at: t.dueAt })),
  ]
    .filter((x) => x.at > s.now && x.at <= until)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

/** From 4 PM: the free hours left tonight, what's due by tomorrow noon, and (Money open) what's left after this week's bills. */
export const tonightRule = (s: LifeSnapshot): Insight[] => {
  const t = localTimeOf(s.now, s.tz);
  if (t < "16:00" || t >= AWAKE_UNTIL) return [];
  const bedtime = localToInstant(s.today, AWAKE_UNTIL, s.tz);
  const free = freeMinutesBetween(s, new Date(nextQuarter(s.now.getTime())), bedtime).minutes;
  const due = dueBefore(s, localToInstant(addDaysStr(s.today, 1), "12:00", s.tz));
  const dueLine = due.length
    ? `${due[0].title} is due ${dueWords(due[0].at, s)}${due.length > 1 ? `, and ${due.length - 1} more by tomorrow noon` : ""}.`
    : "Nothing is due before tomorrow noon.";
  let moneyLine = "";
  if (s.money) {
    const weekEnd = addDaysStr(s.today, 6);
    const bills = s.money.billsNext30.filter((b) => b.date <= weekEnd).reduce((n, b) => n + -b.amountCents, 0);
    moneyLine = ` ${usd(s.money.liquidCents - bills)} left after this week's bills.`;
  }
  return [
    {
      id: `tonight-${s.today}`,
      tone: "good",
      icon: "clock",
      text: free >= 15 ? `Tonight: ${freeWords(free)} free` : "Tonight is fully booked",
      detail: `${dueLine}${moneyLine}`,
      action: { label: "Plan tonight", prompt: "What should I do with tonight?" },
      // what's due is more than the evening holds (two hours or less for it): a heads-up, not just an idea
      weather: due.length && free <= 120 ? "grey" : "clear",
      score: due.length && free <= 120 ? 64 : 48,
    },
  ];
};

/**
 * On a class or work day: free stretches of 45 minutes or more between two booked things today, still ahead, at most two,
 * each with the one thing that fits (the soonest open assignment due this week, else the soonest to-do with a due time).
 */
export const freeGapRule = (s: LifeSnapshot): Insight[] => {
  const todays = s.week.filter((i) => localDateOf(i.startsAt, s.tz) === s.today);
  if (!todays.some((i) => i.blocksTime && (i.kind === "class" || i.origin === "shift"))) return [];
  const fit = s.due?.[0] ? { title: s.due[0].title, at: s.due[0].dueAt } : s.todos?.[0] ? { title: s.todos[0].title, at: s.todos[0].dueAt } : null;
  if (!fit) return [];
  const busy = busyStretches(todays);
  const out: Insight[] = [];
  for (let i = 0; i + 1 < busy.length && out.length < 2; i++) {
    const from = nextQuarter(Math.max(busy[i].to, s.now.getTime()));
    const to = busy[i + 1].from;
    // a gap that ends after the thing is due is no use for it
    if (to - from < GAP_MIN * MIN || from >= fit.at.getTime()) continue;
    const minutes = Math.round((to - from) / MIN);
    const start = new Date(from);
    const end = new Date(from + Math.min(minutes, 90) * MIN);
    const now = from <= s.now.getTime() + 15 * MIN;
    const after = busy[i].last.title;
    const before = busy[i + 1].first.title;
    out.push({
      id: `gap-${s.today}-${hm(start, s.tz)}`,
      tone: "good",
      icon: "clock",
      text: now ? `${freeWords(minutes)} free now, until ${before}` : `${freeWords(minutes)} free at ${clock(start, s.tz)}, after ${after}`,
      detail: `Enough to start ${fit.title}, due ${dueWords(fit.at, s)}.`,
      action: { label: "Block it", block: { date: s.today, start: hm(start, s.tz), end: hm(end, s.tz), title: `Work on ${fit.title}` } },
      weather: "clear",
      score: 58 - out.length,
    });
  }
  return out;
};

/** The nearest open assignment due within 3 days: how much free time is really left before it. */
export const dueMathRule = (s: LifeSnapshot): Insight[] => {
  const a = (s.due ?? []).find((x) => x.dueAt.getTime() - s.now.getTime() <= 72 * 60 * MIN);
  if (!a) return [];
  const { minutes, first } = freeMinutesBetween(s, new Date(nextQuarter(s.now.getTime())), a.dueAt);
  const when = dueWords(a.dueAt, s);
  if (minutes < 60)
    return [
      {
        id: `due-${a.id}`,
        tone: "attention",
        icon: "book",
        text: `No free time before ${a.title} is due`,
        detail: `Due ${when}, and you're booked until then.`,
        action: { label: "Find time", prompt: `${a.title} is due ${when} and my schedule is full until then. Help me find time for it.` },
        weather: "storm",
        score: 88,
      },
    ];
  const tight = minutes < 180;
  const start = first?.from;
  return [
    {
      id: `due-${a.id}`,
      tone: tight ? "heads-up" : "good",
      icon: "book",
      text: `${a.title} is due ${when}`,
      detail: `${tight ? "Only " : ""}${freeWords(minutes)} free before then.`,
      action: start
        ? {
            label: "Block an hour",
            block: { date: localDateOf(start, s.tz), start: hm(start, s.tz), end: hm(new Date(start.getTime() + 60 * MIN), s.tz), title: `Work on ${a.title}` },
          }
        : { label: "See your week", href: "/plan" },
      weather: tight ? "grey" : "clear",
      score: tight ? 70 : 45,
    },
  ];
};
