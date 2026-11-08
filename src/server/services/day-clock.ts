import { addDaysStr, daysBetween, formatDateStr, formatIn, localDateOf, startOfLocalDay, todayIn } from "@/lib/dates";
import { categoryFor, iconFor, sourceFor, splitEmoji, titleFor, type ClockData, type ClockDay, type ClockItem } from "@/lib/day-clock";
import type { UserScope } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { getAgenda, type AgendaItem } from "./calendar";
import { summarizeCashflow } from "./finance/cashflow";
import { expectedPay, upcomingBills } from "./finance/forecast";
import { bankSeries, listGoals } from "./finance/planning";
import { upcomingTrials } from "./finance/subscriptions";
import { queryTransactions } from "./finance/transactions";
import { healthSummary } from "./health";
import { lifeTimeline } from "./milestones";
import { listPersonalGoals } from "./personal-goals";
import { listTasks } from "./tasks";

/** Days either side of today in the day picker (and the dense part of the line). */
export const CLOCK_SPAN = 3;
/** How far ahead the line reaches for plans (flights, trips, exams); goals and milestones go any distance. */
export const AHEAD_DAYS = 60;

/** Wall-clock minutes of an instant from the start of `today` in tz (tomorrow 8:00 AM = 1440 + 480). */
export function wallMinutes(instant: Date, tz: string, today: string): number {
  const [date, hm] = formatIn(instant, tz, "yyyy-MM-dd HH:mm").split(" ");
  const [h, m] = hm.split(":").map(Number);
  return daysBetween(today, date) * 1440 + h * 60 + m;
}

/** One agenda item as the clock draws it. All-day things sit at the start of their day and never on the rim. */
export function toClockItem(a: AgendaItem, tz: string, today: string): ClockItem {
  const { title: named, subtitle } = titleFor(a.title, a.origin);
  // An emoji at the start of the title is the icon the person picked (a pin), not part of the name.
  const { emoji, rest: title } = splitEmoji(named);
  const at = wallMinutes(a.startsAt, tz, today);
  const start = a.allDay ? Math.floor(at / 1440) * 1440 : at;
  const end = a.allDay || !a.endsAt ? null : Math.max(start + 1, wallMinutes(a.endsAt, tz, today));
  return {
    id: a.key,
    kind: end != null ? "block" : "due",
    cat: categoryFor(a.kind, a.origin),
    icon: emoji ?? iconFor(a.title, a.kind, a.origin),
    title,
    start,
    end,
    allDay: a.allDay,
    href: a.href,
    source: sourceFor(a.origin, a.sources),
    subtitle: subtitle ?? a.subtitle,
    origin: a.origin,
    ref: a.id,
  };
}

/** Dollars for a card line ("$1,850"). */
const usd = (cents: number) => `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;

/**
 * Everything the clock and the timeline show, in one read (owner, 2026-11-08: every piece of data that has a time
 * flows in). From the person's own data only, nothing guessed:
 * - the week in full from the one agenda (calendars, shifts, class deadlines and exams);
 * - further out, to AHEAD_DAYS: one-off plans (a flight, an appointment, a birthday) and class deadlines, but not
 *   routine (an event that repeats three or more times in that stretch, or shifts), so the far line stays clear;
 * - every open to-do at its due time, and its reminder when it rings well before (an hour or more);
 * - milestones and goals reached behind, goals ahead by their day; undated to-dos and goals under "Someday";
 * - with the Money lock open (`money`): bills and trial ends in the next 30 days, money goals by their day,
 *   salaried pay as expected (never counted), and what was spent today.
 */
export async function dayClockData(scope: UserScope, tz: string, now = new Date(), opts: { money?: boolean } = {}): Promise<ClockData> {
  const today = todayIn(tz, now);
  const from = addDaysStr(today, -CLOCK_SPAN);
  const to = addDaysStr(today, CLOCK_SPAN);
  const [agenda, ahead, health, story, goals, open] = await series(
    () => getAgenda(scope, tz, from, to, { now, include: ["event", "shift", "assignment"] }),
    () => getAgenda(scope, tz, addDaysStr(to, 1), addDaysStr(today, AHEAD_DAYS), { now, include: ["event", "assignment"] }),
    () => healthSummary(scope, tz, 1, now),
    () => lifeTimeline(scope, { includeMoney: !!opts.money, tz }),
    () => listPersonalGoals(scope),
    () => listTasks(scope, { status: "open", limit: 300 }),
  );
  // Far out, routine is noise: a class every week or a daily event shows in the week only.
  const times = new Map<string, number>();
  for (const a of ahead) if (a.repeats) times.set(a.id, (times.get(a.id) ?? 0) + 1);
  const items = [...agenda, ...ahead.filter((a) => !a.repeats || (times.get(a.id) ?? 0) < 3)].map((a) => toClockItem(a, tz, today));
  const dayAt = (date: string) => daysBetween(today, date) * 1440;
  for (const m of story) {
    if (!m.date) continue;
    const { emoji, rest } = splitEmoji(m.title);
    const reached = m.kind !== "milestone";
    items.push({
      id: `story:${m.kind}:${m.id}`,
      kind: "due",
      cat: "other",
      icon: emoji ?? (reached ? "🎯" : "🏁"),
      title: reached ? `${rest} · reached` : rest,
      start: dayAt(m.date),
      end: null,
      allDay: true,
      href: m.kind === "money_goal" ? "/money" : "/milestones",
      source: reached ? "A goal you reached" : "From your milestones",
      subtitle: null,
      origin: "milestone",
      when: m.precision === "year" ? m.date.slice(0, 4) : m.precision === "month" ? formatDateStr(m.date, "MMM yyyy") : undefined,
    });
  }
  for (const g of goals) {
    if (g.doneAt) continue;
    const { emoji, rest } = splitEmoji(g.title);
    items.push({
      id: `goal:${g.id}`,
      kind: "due",
      cat: "other",
      icon: emoji ?? "🎯",
      title: rest,
      start: g.targetDate ? dayAt(g.targetDate) : 0,
      end: null,
      allDay: true,
      href: "/goals",
      source: "From your goals",
      subtitle: g.unit && g.target ? `${g.progress ?? 0} of ${g.target} ${g.unit}` : null,
      origin: "goal",
      ref: g.id,
      someday: !g.targetDate,
    });
  }
  // To-dos: every open one, at its due time (overdue ones stay where they were due); undated top-level ones wait under
  // Someday. A reminder that rings an hour or more before its to-do is due is its own moment on the clock and the line.
  for (const t of open) {
    const { emoji, rest } = splitEmoji(t.title);
    const icon = emoji ?? iconFor(t.title, "task", "task");
    const base = { kind: "due" as const, cat: "other" as const, icon, title: rest, end: null, href: `/tasks/${t.id}`, origin: "task" as const, ref: t.id };
    if (!t.dueAt) {
      if (!t.parentId) items.push({ ...base, id: `task:${t.id}`, start: 0, allDay: true, source: "From your to-dos", subtitle: null, someday: true });
      continue;
    }
    const at = wallMinutes(t.dueAt, tz, today);
    items.push({
      ...base,
      id: `task:${t.id}`,
      cat: "due",
      start: t.dueAllDay ? Math.floor(at / 1440) * 1440 : at,
      allDay: t.dueAllDay,
      source: "From your to-dos",
      subtitle: t.priority === "urgent" || t.priority === "high" ? `${t.priority} priority` : null,
    });
    const r = t.remindAt;
    if (r && !t.remindedAt && r > now && t.dueAt.getTime() - r.getTime() >= 3_600_000 && localDateOf(r, tz) <= addDaysStr(today, AHEAD_DAYS)) {
      items.push({
        ...base,
        id: `remind:${t.id}`,
        icon: "🔔",
        start: wallMinutes(r, tz, today),
        allDay: false,
        source: "Your reminder",
        subtitle: `Due ${formatIn(t.dueAt, tz, t.dueAllDay ? "EEE, MMM d" : "EEE, MMM d 'at' h:mm a")}`,
        origin: "reminder",
      });
    }
  }
  let spentTodayCents: number | null = null;
  if (opts.money) {
    const until = addDaysStr(today, 30);
    const bank = await bankSeries(scope, today);
    const [bills, pay, saving, trials, todays] = await series(
      () => upcomingBills(scope, today, today, until, bank),
      () => expectedPay(scope, today, until, bank),
      () => listGoals(scope),
      () => upcomingTrials(scope, today, until),
      () => queryTransactions(scope, { from: today, to: today, limit: 1000 }),
    );
    const money = { kind: "due" as const, cat: "due" as const, end: null, allDay: true, subtitle: null };
    for (const b of bills)
      items.push({
        ...money,
        id: `bill:${b.key}`,
        icon: "💳",
        title: b.name,
        start: dayAt(b.date),
        href: "/finances/bills",
        source: b.found ? "Found in your bank activity" : "From your bills",
        amountCents: Math.abs(b.amountCents),
        origin: "bill",
      });
    for (const t of trials)
      if (t.trialEndsOn)
        items.push({
          ...money,
          id: `trial:${t.id}`,
          cat: "other",
          icon: "⏳",
          title: `${t.name} trial ends`,
          start: dayAt(t.trialEndsOn),
          href: "/finances/subscriptions",
          source: "From your subscriptions",
          subtitle: "The first charge comes after this day",
          amountCents: Math.abs(t.amountCents),
          origin: "trial",
        });
    for (const p of pay)
      items.push({
        ...money,
        id: `pay:${p.date}`,
        cat: "other",
        icon: "💵",
        title: "Payday",
        start: dayAt(p.date),
        href: "/money",
        source: "Expected from your past paychecks; not counted until it lands",
        subtitle: p.name,
        amountCents: Math.abs(p.amountCents),
        origin: "pay",
      });
    for (const g of saving)
      if (g.targetDate && g.status === "active" && g.savedCents < g.targetCents)
        items.push({
          ...money,
          id: `saving:${g.id}`,
          cat: "other",
          icon: "💰",
          title: g.name,
          start: dayAt(g.targetDate),
          href: "/money",
          source: "Your money goal",
          subtitle: `${usd(g.savedCents)} saved so far`,
          amountCents: g.targetCents,
          origin: "money_goal",
        });
    const spent = summarizeCashflow(todays).netSpendingCents;
    spentTodayCents = spent > 0 ? spent : null;
  }
  items.sort((a, b) => a.start - b.start);
  const steps = health.metrics.find((m) => m.metric === "steps");
  const sleep = health.metrics.find((m) => m.metric === "sleep_hours");
  const days: ClockDay[] = [];
  for (let offset = -CLOCK_SPAN; offset <= CLOCK_SPAN; offset++) {
    const date = addDaysStr(today, offset);
    days.push({ offset, date, short: offset === 0 ? "Today" : formatDateStr(date, "EEE"), long: formatDateStr(date, "EEE, MMM d") });
  }
  const todaySteps = steps && steps.latest.day === today ? Math.round(steps.latest.value) : null;
  const sleepHours = sleep && sleep.latest.day === today ? sleep.latest.value : null;
  return {
    tz,
    today,
    base: startOfLocalDay(today, tz).getTime(),
    days,
    items,
    steps: todaySteps,
    sleepHours,
    spentTodayCents,
    empty: items.length === 0 && todaySteps == null,
  };
}
