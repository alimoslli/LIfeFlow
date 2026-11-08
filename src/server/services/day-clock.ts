import { addDaysStr, daysBetween, formatDateStr, formatIn, startOfLocalDay, todayIn } from "@/lib/dates";
import { categoryFor, iconFor, sourceFor, titleFor, type ClockData, type ClockDay, type ClockItem } from "@/lib/day-clock";
import type { UserScope } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { getAgenda, type AgendaItem } from "./calendar";
import { summarizeCashflow } from "./finance/cashflow";
import { billsAndPace } from "./finance/forecast";
import { queryTransactions } from "./finance/transactions";
import { healthSummary } from "./health";

/** Days either side of today on the line (the day picker shows them all). */
export const CLOCK_SPAN = 3;

/** Wall-clock minutes of an instant from the start of `today` in tz (tomorrow 8:00 AM = 1440 + 480). */
export function wallMinutes(instant: Date, tz: string, today: string): number {
  const [date, hm] = formatIn(instant, tz, "yyyy-MM-dd HH:mm").split(" ");
  const [h, m] = hm.split(":").map(Number);
  return daysBetween(today, date) * 1440 + h * 60 + m;
}

/** One agenda item as the clock draws it. All-day things sit at the start of their day and never on the rim. */
export function toClockItem(a: AgendaItem, tz: string, today: string): ClockItem {
  const { title, subtitle } = titleFor(a.title, a.origin);
  const at = wallMinutes(a.startsAt, tz, today);
  const start = a.allDay ? Math.floor(at / 1440) * 1440 : at;
  const end = a.allDay || !a.endsAt ? null : Math.max(start + 1, wallMinutes(a.endsAt, tz, today));
  return {
    id: a.key,
    kind: end != null ? "block" : "due",
    cat: categoryFor(a.kind, a.origin),
    icon: iconFor(a.title, a.kind, a.origin),
    title,
    start,
    end,
    allDay: a.allDay,
    href: a.href,
    source: sourceFor(a.origin, a.sources),
    subtitle: subtitle ?? a.subtitle,
  };
}

/**
 * Everything the day clock shows, in one read: the week around today from the one agenda (calendars,
 * work shifts, class deadlines and exams, to-dos with a time), today's steps and last night's sleep, and,
 * when money is shown (`money`: the Money lock is open), bills due in the next days and what was spent today.
 * Only real things from the person's own data; nothing is guessed or filled in.
 */
export async function dayClockData(scope: UserScope, tz: string, now = new Date(), opts: { money?: boolean } = {}): Promise<ClockData> {
  const today = todayIn(tz, now);
  const from = addDaysStr(today, -CLOCK_SPAN);
  const to = addDaysStr(today, CLOCK_SPAN);
  const [agenda, health] = await series(
    () => getAgenda(scope, tz, from, to, { now }),
    () => healthSummary(scope, tz, 1, now),
  );
  const items = agenda.map((a) => toClockItem(a, tz, today));
  let spentTodayCents: number | null = null;
  if (opts.money) {
    const [bills, todays] = await series(
      () => billsAndPace(scope, today, today, addDaysStr(today, CLOCK_SPAN)),
      () => queryTransactions(scope, { from: today, to: today, limit: 1000 }),
    );
    for (const b of bills.bills) {
      const offset = daysBetween(today, b.date);
      items.push({
        id: `bill:${b.key}`,
        kind: "due",
        cat: "due",
        icon: "💳",
        title: b.name,
        start: offset * 1440,
        end: null,
        allDay: true,
        href: "/finances/bills",
        source: b.found ? "Found in your bank activity" : "From your bills",
        subtitle: null,
        amountCents: Math.abs(b.amountCents),
      });
    }
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
