import { addDaysStr, daysBetween, formatDateStr, formatIn, localDateOf, startOfLocalDay, todayIn } from "@/lib/dates";
import { categoryFor, iconFor, sourceFor, splitEmoji, titleFor, type ClockData, type ClockDay, type ClockItem } from "@/lib/day-clock";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { UserScope } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { assignments, habitChecks, habits, healthSamples, promises, tasks } from "@/server/db/schema";
import { getAgenda, type AgendaItem } from "./calendar";
import { summarizeCashflow, type CashflowTxn } from "./finance/cashflow";
import { expectedPay, upcomingBills } from "./finance/forecast";
import { bankSeries, listGoals } from "./finance/planning";
import { upcomingTrials } from "./finance/subscriptions";
import { queryAllTransactions } from "./finance/transactions";
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
    ...(a.kind === "exam" && { exam: true }),
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
 *   salaried pay as expected (never counted), and what was spent today;
 * - what happened (owner, 2026-11-10: "it's supposed to show your life on it"): to-dos and assignments ticked off where
 *   they were done, promises at their time (and kept ones where they were kept; never the broken ones), and for each past
 *   day of the week one short recap from real records: sleep, steps, active minutes, habits done, and with the Money lock
 *   open what went out and came in.
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
  items.push(...(await lifeSoFar(scope, tz, today, now)));

  let spentTodayCents: number | null = null;
  let spentByDay = new Map<string, { out: number; in: number }>();
  if (opts.money) {
    const until = addDaysStr(today, 30);
    const bank = await bankSeries(scope, today);
    const [bills, pay, saving, trials, todays] = await series(
      () => upcomingBills(scope, today, today, until, bank),
      () => expectedPay(scope, today, until, bank),
      () => listGoals(scope),
      () => upcomingTrials(scope, today, until),
      () => queryAllTransactions(scope, { from, to: today }),
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
          href: "/finances/bills",
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
    // by the day it really happened (the bank's own time or date; posted date only when that's all there is), so the
    // marks, the day's total and "spent today" agree
    const byDay = new Map<string, typeof todays>();
    for (const t of todays) {
      const d = purchaseDay(t, tz);
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    spentByDay = new Map([...byDay].map(([d, rows]) => [d, { out: summarizeCashflow(rows).netSpendingCents, in: summarizeCashflow(rows).incomeCents }]));
    const spent = spentByDay.get(today)?.out ?? 0;
    spentTodayCents = spent > 0 ? spent : null;
    items.push(...purchaseMarks(todays, { tz, today, from, now }));
  }
  items.push(...(await dayRecaps(scope, today, from, spentByDay)));
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

/** Hours as "7h 10m". */
const hm = (hours: number) => {
  const m = Math.round(hours * 60);
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
};

/**
 * What already happened and what they said they'd do, as the line shows it (dayClockData says why): to-dos and assignments
 * done this week, where they were done; promises open or kept, at their time.
 */
async function lifeSoFar(scope: UserScope, tz: string, today: string, now: Date): Promise<ClockItem[]> {
  const since = startOfLocalDay(addDaysStr(today, -CLOCK_SPAN), tz);
  const until = startOfLocalDay(addDaysStr(today, AHEAD_DAYS + 1), tz);
  const [doneTasks, doneWork, said] = await series(
    () =>
      scope.tx
        .select({ id: tasks.id, title: tasks.title, at: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.userId, scope.userId), eq(tasks.status, "done"), isNull(tasks.parentId), gte(tasks.completedAt, since)))
        .limit(80),
    () =>
      scope.tx
        .select({ id: assignments.id, title: assignments.title, courseId: assignments.courseId, at: assignments.completedAt })
        .from(assignments)
        .where(and(eq(assignments.userId, scope.userId), eq(assignments.status, "done"), gte(assignments.completedAt, since)))
        .limit(80),
    () =>
      scope.tx
        .select({ id: promises.id, text: promises.text, dueAt: promises.dueAt, status: promises.status, resolvedAt: promises.resolvedAt })
        .from(promises)
        .where(and(eq(promises.userId, scope.userId), inArray(promises.status, ["open", "kept"]), gte(promises.dueAt, since), lte(promises.dueAt, until)))
        .orderBy(asc(promises.dueAt))
        .limit(80),
  );
  const out: ClockItem[] = [];
  const doneAt = (at: Date) => Math.min(wallMinutes(at, tz, today), wallMinutes(now, tz, today));
  for (const t of doneTasks) {
    if (!t.at) continue;
    const { emoji, rest } = splitEmoji(t.title);
    out.push({
      id: `done:task:${t.id}`,
      kind: "due",
      cat: "other",
      icon: emoji ?? iconFor(t.title, "task", "task"),
      title: rest,
      start: doneAt(t.at),
      end: null,
      allDay: false,
      href: `/tasks/${t.id}`,
      source: "From your to-dos",
      subtitle: "Done",
      origin: "task",
      ref: t.id,
      done: true,
    });
  }
  for (const a of doneWork) {
    if (!a.at) continue;
    out.push({
      id: `done:assignment:${a.id}`,
      kind: "due",
      cat: "other",
      icon: "📄",
      title: a.title,
      start: doneAt(a.at),
      end: null,
      allDay: false,
      href: `/school/courses/${a.courseId}`,
      source: "From your classes",
      subtitle: "Done",
      origin: "assignment",
      ref: a.id,
      done: true,
    });
  }
  for (const p of said) {
    const kept = p.status === "kept";
    const text = p.text.charAt(0).toUpperCase() + p.text.slice(1);
    out.push({
      id: `promise:${p.id}`,
      kind: "due",
      cat: "other",
      icon: "🤞",
      title: text,
      start: kept && p.resolvedAt ? doneAt(p.resolvedAt) : wallMinutes(p.dueAt, tz, today),
      end: null,
      allDay: false,
      href: "/jarvis?ask=How%20are%20my%20promises%20going%3F",
      source: "Your promise",
      subtitle: kept ? "Kept" : null,
      origin: "promise",
      ref: p.id,
      done: kept || undefined,
    });
  }
  return out;
}

/**
 * One short recap for each past day of the week, at the end of that day, from real records only: sleep, steps and active
 * minutes (Apple Health or what they logged), habits done, and (Money lock open) what went out and came in. A day with
 * none of these has no recap.
 */
async function dayRecaps(scope: UserScope, today: string, from: string, money: Map<string, { out: number; in: number }>): Promise<ClockItem[]> {
  const yesterday = addDaysStr(today, -1);
  const [health, checks] = await series(
    () =>
      scope.tx
        .select({ metric: healthSamples.metric, day: healthSamples.day, value: healthSamples.value })
        .from(healthSamples)
        .where(
          and(
            eq(healthSamples.userId, scope.userId),
            gte(healthSamples.day, from),
            lte(healthSamples.day, yesterday),
            inArray(healthSamples.metric, ["sleep_hours", "steps", "exercise_minutes"]),
          ),
        ),
    () =>
      scope.tx
        .select({ day: habitChecks.day, title: habits.title })
        .from(habitChecks)
        .innerJoin(habits, eq(habits.id, habitChecks.habitId))
        .where(and(eq(habitChecks.userId, scope.userId), eq(habitChecks.done, true), gte(habitChecks.day, from), lte(habitChecks.day, yesterday))),
  );
  const out: ClockItem[] = [];
  for (let d = from; d <= yesterday; d = addDaysStr(d, 1)) {
    const facts: [string, string][] = [];
    const v = (m: string) => health.find((h) => h.day === d && h.metric === m)?.value;
    const sleep = v("sleep_hours");
    if (sleep) facts.push(["😴", `Slept ${hm(Number(sleep))}`]);
    const steps = v("steps");
    if (steps) facts.push(["👟", `${Math.round(Number(steps)).toLocaleString("en-US")} steps`]);
    const active = v("exercise_minutes");
    if (active) facts.push(["🏃", `${Math.round(Number(active))} min active`]);
    const did = checks.filter((c) => c.day === d).map((c) => c.title);
    if (did.length) facts.push(["✅", did.length === 1 ? did[0] : `${did.length} habits`]);
    // what went out has its own mark beside this one (purchaseMarks); what came in stays here
    const m = money.get(d);
    if (m && m.in > 0) facts.push(["💵", `${usd(m.in)} came in`]);
    if (!facts.length) continue;
    out.push({
      id: `day:${d}`,
      kind: "due",
      cat: "other",
      icon: facts[0][0],
      title: facts
        .slice(0, 2)
        .map((f) => f[1])
        .join(" · "),
      // the end of that day, where its recap belongs
      start: daysBetween(today, d) * 1440 + 1438,
      end: null,
      allDay: false,
      href: "/habits",
      source: "Your day",
      subtitle: facts.map((f) => f[1]).join(" · "),
      origin: "day",
      when: formatDateStr(d, "EEEE"),
      done: true,
    });
  }
  return out;
}

type PurchaseRow = CashflowTxn & {
  id: string;
  date: string;
  authorizedDate: string | null;
  authorizedAt: Date | null;
  merchantName: string | null;
  description: string;
  categoryName?: string | null;
};

/** The day a purchase happened: the bank's own time, else its authorized date, else the posted date. */
export function purchaseDay(t: Pick<PurchaseRow, "date" | "authorizedDate" | "authorizedAt">, tz: string) {
  return t.authorizedAt ? localDateOf(t.authorizedAt, tz) : (t.authorizedDate ?? t.date);
}

/** "$6.50", "$42", "$1,240": cents only under $100. */
function price(cents: number) {
  const c = Math.abs(cents);
  return c < 10_000 && c % 100 ? `$${(c / 100).toFixed(2)}` : `$${Math.round(c / 100).toLocaleString("en-US")}`;
}

/**
 * Purchases on the line (owner, 2026-11-12: "each purchase on its own but also clearly shows days total"; Money lock open
 * only): a purchase whose bank gave its time is a mark at that time, with its name and amount; one without a time is never
 * given one. Every day with spending has one total at its end, listing every purchase; today's sits just before now and
 * says "so far". Refunds lower the total (as on Money); transfers and excluded rows are left out.
 */
export function purchaseMarks(rows: PurchaseRow[], o: { tz: string; today: string; from: string; now: Date }): ClockItem[] {
  const spend = rows.filter((t) => !t.excluded && t.kind === "expense" && t.amountCents < 0);
  const name = (t: PurchaseRow, max: number) => (t.merchantName || t.description).slice(0, max);
  const out: ClockItem[] = [];
  for (const t of spend) {
    if (!t.authorizedAt) continue;
    const day = localDateOf(t.authorizedAt, o.tz);
    if (day < o.from || day > o.today || t.authorizedAt > o.now) continue;
    out.push({
      id: `spend:${t.id}`,
      kind: "due",
      cat: "other",
      icon: "💳",
      title: name(t, 40),
      start: wallMinutes(t.authorizedAt, o.tz, o.today),
      end: null,
      allDay: false,
      href: "/finances/transactions",
      source: "From your bank",
      subtitle: [t.categoryName, t.pending ? "Pending" : null].filter(Boolean).join(" · ") || null,
      amountCents: -t.amountCents,
      origin: "spend",
    });
  }
  const nowMin = wallMinutes(o.now, o.tz, o.today);
  const byDay = new Map<string, PurchaseRow[]>();
  for (const t of rows) {
    if (t.excluded) continue;
    const d = purchaseDay(t, o.tz);
    if (d >= o.from && d <= o.today) byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  for (const [d, dayRows] of byDay) {
    const total = summarizeCashflow(dayRows).netSpendingCents;
    // by time, then by name (the bank's rows can come back in any order when they were saved together)
    const bought = spend
      .filter((t) => purchaseDay(t, o.tz) === d)
      .sort((a, b) => (a.authorizedAt?.getTime() ?? 0) - (b.authorizedAt?.getTime() ?? 0) || name(a, 30).localeCompare(name(b, 30)));
    if (total <= 0 || !bought.length) continue;
    const isToday = d === o.today;
    out.push({
      id: `spent:${d}`,
      kind: "due",
      cat: "other",
      icon: "💸",
      title: `Spent ${price(total)}${isToday ? " so far" : ""}`,
      // the end of a past day (just before its recap); today, just before now
      start: isToday ? Math.max(0, nowMin - 1) : daysBetween(o.today, d) * 1440 + 1437,
      end: null,
      allDay: false,
      href: "/finances/transactions",
      source: "From your bank",
      subtitle: `${bought.length} purchase${bought.length === 1 ? "" : "s"}`,
      origin: "spent",
      when: isToday ? undefined : formatDateStr(d, "EEEE"),
    });
  }
  return out;
}
