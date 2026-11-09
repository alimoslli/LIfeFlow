import { addDaysStr, formatIn, localDateOf, localToInstant, todayIn } from "@/lib/dates";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { getAgenda } from "./calendar";
import { listAccounts } from "./finance/accounts";
import { balancesOf } from "./finance/overview";
import { upcomingRecurring } from "./finance/planning";
import { listAssignments } from "./school";
import { listTasks } from "./tasks";

/**
 * "Tonight": the next 24 hours of a life on one small page, from the person's own records and nothing else (the north star, ADR 0033).
 * No AI and no guesses: what is due, what the shift or events take, how many free hours are left, and (unless Money is locked) what is left
 * after the bills due this week. With a plan ("go out: $25, 3 hours") it shows what that plan costs in the same units.
 * Assumes you're up until `AWAKE_UNTIL`, and says so.
 */
export const AWAKE_UNTIL = "23:00";
const HOUR = 3_600_000;

export type TonightPlan = { label?: string; spendCents?: number; hours?: number };

export async function tonight(scope: UserScope, tz: string, now: Date, opts: { includeMoney: boolean; plan?: TonightPlan }) {
  const today = todayIn(tz, now);
  const horizon = new Date(now.getTime() + 24 * HOUR);
  const awakeEnd = localToInstant(today, AWAKE_UNTIL, tz);
  const weekEnd = addDaysStr(today, 6);

  const [agenda, upcoming, overdue, tasks] = await series(
    () => getAgenda(scope, tz, today, addDaysStr(today, 1), { include: ["event", "shift"], now }),
    () => listAssignments(scope, tz, { view: "upcoming", now, limit: 100 }),
    () => listAssignments(scope, tz, { view: "overdue", now, limit: 50 }),
    () => listTasks(scope, { status: "open", dueBefore: horizon }),
  );
  const money = opts.includeMoney
    ? await series(
        () => upcomingRecurring(scope, today, weekEnd),
        () => listAccounts(scope),
      )
    : null;

  const when = (d: Date) => `${localDateOf(d, tz) === today ? "today" : "tomorrow"} ${formatIn(d, tz, "h:mm a")}`;
  const due = [
    ...overdue.map((a) => ({ what: a.title, course: a.course.code ?? a.course.name, kind: a.kind as string, due: "overdue", late: true })),
    ...upcoming
      .filter((a) => a.dueAt && a.dueAt <= horizon)
      .map((a) => ({ what: a.title, course: a.course.code ?? a.course.name, kind: a.kind as string, due: when(a.dueAt!), late: false })),
    ...tasks
      .filter((t) => t.dueAt)
      .map((t) => ({ what: t.title, course: null as string | null, kind: "to-do", due: t.dueAllDay ? "today" : when(t.dueAt!), late: t.dueAt! < now })),
  ];

  // Time already spoken for between now and bedtime: shifts, classes and events, clipped to that window.
  const blocks = agenda
    .filter((i) => i.blocksTime && i.endsAt && i.endsAt > now && i.startsAt < awakeEnd)
    .map((i) => ({
      title: i.title.replace(/^Work · /, "Work at "),
      from: formatIn(i.startsAt, tz, "h:mm a"),
      to: formatIn(i.endsAt!, tz, "h:mm a"),
      minutes: Math.round((Math.min(i.endsAt!.getTime(), awakeEnd.getTime()) - Math.max(i.startsAt.getTime(), now.getTime())) / 60_000),
    }))
    .filter((b) => b.minutes > 0);
  const windowMin = Math.max(0, Math.round((awakeEnd.getTime() - now.getTime()) / 60_000));
  const busyMin = blocks.reduce((n, b) => n + b.minutes, 0);
  const freeMin = Math.max(0, windowMin - busyMin);

  let cash: {
    cashCents: number;
    billsThisWeekCents: number;
    leftAfterBillsCents: number;
    bills: { name: string; date: string; amountCents: number }[];
  } | null = null;
  if (money) {
    const bills = money[0].filter((b) => b.amountCents < 0).map((b) => ({ name: b.name, date: b.date, amountCents: -b.amountCents }));
    const cashCents = balancesOf(money[1]).cashCents;
    const billsThisWeekCents = bills.reduce((n, b) => n + b.amountCents, 0);
    cash = { cashCents, billsThisWeekCents, leftAfterBillsCents: cashCents - billsThisWeekCents, bills };
  }

  const plan = opts.plan;
  const tradeoff = plan
    ? {
        label: plan.label ?? "this plan",
        freeMinutesAfter: plan.hours != null ? Math.max(0, freeMin - Math.round(plan.hours * 60)) : null,
        overFreeTime: plan.hours != null ? Math.round(plan.hours * 60) > freeMin : null,
        leftAfterBillsAfterCents: cash && plan.spendCents != null ? cash.leftAfterBillsCents - plan.spendCents : null,
        wouldDipBelowZero: cash && plan.spendCents != null ? cash.leftAfterBillsCents - plan.spendCents < 0 : null,
        itemsStillDue: due.length,
      }
    : null;

  return {
    asOf: formatIn(now, tz, "EEE h:mm a"),
    due,
    blocks,
    freeMinutes: freeMin,
    cash,
    tradeoff,
    assumes: `You're up until ${AWAKE_UNTIL}. Free time is what's left of that after shifts, classes and events.${opts.includeMoney ? "" : " Money is locked, so it's left out."}${cash ? " Money is cash minus bills due in the next 7 days." : ""}`,
  };
}
