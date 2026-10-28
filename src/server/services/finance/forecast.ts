import { series } from "@/server/db/series";
import { addDaysStr, daysBetween, formatDateStr, monthEnd, monthStart, weekStart } from "@/lib/dates";
import type { UserScope } from "../../db/with-user";
import { summarizeCashflow } from "./cashflow";
import { listAccounts } from "./accounts";
import { balancesOf } from "./overview";
import { budgetStatus, listGoals, listRecurring, upcomingRecurring } from "./planning";
import { detectRecurring, merchantKey } from "./recurring-detect";
import { queryTransactions } from "./transactions";

/**
 * Forward-looking money math. Every result carries the inputs it used, so the
 * app and Jarvis can show the working instead of a bare verdict. Expected pay
 * is shown separately and never mixed into "safe to spend".
 */

// ------------------------------------------------------------ pure helpers

export type DatedAmount = { date: string; amountCents: number; name: string };

/** Day-by-day cash projection: known bills plus typical daily spending, optionally plus expected pay. */
export function projectCash(input: { startCents: number; today: string; days: number; bills: DatedAmount[]; income: DatedAmount[]; dailySpendCents: number }) {
  const points: { date: string; withoutPayCents: number; withPayCents: number }[] = [];
  let a = input.startCents;
  let b = input.startCents;
  for (let i = 0; i <= input.days; i++) {
    const date = addDaysStr(input.today, i);
    const bills = input.bills.filter((x) => x.date === date).reduce((s, x) => s + x.amountCents, 0); // negative
    const pay = input.income.filter((x) => x.date === date).reduce((s, x) => s + x.amountCents, 0);
    // Today's typical spending is still to come only partly; count it from tomorrow.
    const spend = i === 0 ? 0 : input.dailySpendCents;
    a += bills - spend;
    b += bills - spend + pay;
    points.push({ date, withoutPayCents: a, withPayCents: b });
  }
  const low = (k: "withoutPayCents" | "withPayCents") => points.reduce((m, p) => (p[k] < m[k] ? p : m), points[0]);
  const firstBelow = (k: "withoutPayCents" | "withPayCents") => points.find((p) => p[k] < 0)?.date ?? null;
  return {
    points,
    lowestWithoutPay: { date: low("withoutPayCents").date, cents: low("withoutPayCents").withoutPayCents },
    lowestWithPay: { date: low("withPayCents").date, cents: low("withPayCents").withPayCents },
    overdraftDateWithoutPay: firstBelow("withoutPayCents"),
    overdraftDateWithPay: firstBelow("withPayCents"),
  };
}

/**
 * Safe to spend = cash on hand, minus bills due before the next paycheck,
 * minus what the user plans to set aside for goals in that time, spread over
 * the days until then.
 */
export function safeToSpendCalc(i: {
  cashCents: number;
  today: string;
  /** Next expected pay date, or null: then the window runs to month end. */
  horizon: string;
  billsDueCents: number;
  goalSetAsideCents: number;
  bufferCents: number;
  spentTodayCents: number;
  spentThisWeekCents: number;
  weekEnd: string;
}) {
  // At least a week, so a payday tomorrow doesn't turn all cash into "spend it now".
  const days = Math.max(7, daysBetween(i.today, i.horizon));
  const available = i.cashCents - i.billsDueCents - i.goalSetAsideCents - i.bufferCents;
  const perDay = Math.floor(Math.max(0, available) / days);
  const weekDaysLeft = Math.max(1, Math.min(daysBetween(i.today, i.weekEnd) + 1, days));
  return {
    availableCents: available,
    perDayCents: perDay,
    todayCents: Math.max(0, perDay - i.spentTodayCents),
    thisWeekCents: Math.max(0, perDay * weekDaysLeft - i.spentTodayCents),
    days,
    short: available < 0,
  };
}

/** Where a budget is heading at the current pace, with a concrete fix if it's heading over. */
export function budgetPace(i: {
  category: string;
  limitCents: number;
  spentCents: number;
  today: string;
  /** Biggest merchant in this category this month, with its typical purchase. */
  topMerchant: { name: string; avgCents: number; count: number } | null;
}) {
  const start = monthStart(i.today);
  const end = monthEnd(i.today);
  const elapsed = daysBetween(start, i.today) + 1;
  const total = daysBetween(start, end) + 1;
  const left = total - elapsed;
  const projected = Math.round((i.spentCents / elapsed) * total);
  const remaining = i.limitCents - i.spentCents;
  const status: "over" | "heading_over" | "on_track" =
    remaining < 0 ? "over" : elapsed >= 5 && projected > i.limitCents * 1.05 && left > 0 ? "heading_over" : "on_track";
  let fix: string | null = null;
  if (status !== "on_track") {
    const perDay = left > 0 ? Math.max(0, Math.floor(remaining / left)) : 0;
    const overBy = status === "over" ? -remaining : projected - i.limitCents;
    const skip = i.topMerchant && i.topMerchant.avgCents > 0 ? Math.ceil(overBy / i.topMerchant.avgCents) : null;
    // Only suggest skipping purchases the user would plausibly still make this month at their current rate.
    const expectedMore = i.topMerchant ? (i.topMerchant.count / elapsed) * left : 0;
    if (status === "heading_over" && skip && i.topMerchant && skip <= Math.max(1, expectedMore)) {
      fix = `Skip ${skip} ${i.topMerchant.name} purchase${skip === 1 ? "" : "s"} (about ${dollars(i.topMerchant.avgCents)} each) and you're back on track.`;
    } else if (status === "heading_over") {
      fix = `Keep ${i.category} to about ${dollars(perDay)} a day for the last ${left} day${left === 1 ? "" : "s"} to stay within budget.`;
    } else {
      fix = `This budget is already over by ${dollars(-remaining)}. Pausing ${i.category} spending for the rest of the month keeps it from growing, or raise the limit if it was too low.`;
    }
  }
  return { status, projectedCents: projected, remainingCents: remaining, daysLeft: left, fix };
}

const nice = (d: string) => formatDateStr(d, "EEE, MMM d");
const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0, minimumFractionDigits: 0 })}`;

// ------------------------------------------------------------ data

/** Average daily day-to-day spending over the last 8 weeks, leaving out tracked bills (they're counted on their dates). */
async function typicalDailySpend(scope: UserScope, today: string) {
  const from = addDaysStr(today, -56);
  const [txns, recurring] = await series(
    () => queryTransactions(scope, { from, to: addDaysStr(today, -1), limit: 20_000 }),
    () => listRecurring(scope),
  );
  const billKeys = new Set(recurring.filter((r) => r.amountCents < 0).map((r) => r.merchantKey));
  const dayToDay = txns.filter((t) => !billKeys.has(merchantKey(t)));
  const spent = summarizeCashflow(dayToDay).netSpendingCents;
  const days = Math.max(1, Math.min(56, txns.length ? daysBetween(txns[txns.length - 1].date, today) : 1));
  return { dailyCents: Math.max(0, Math.round(spent / days)), basedOnDays: days };
}

/** Expected pay: tracked income items, or a paycheck pattern detected from deposits. Labelled as expected, never counted as received. */
async function expectedPay(scope: UserScope, today: string, to: string): Promise<DatedAmount[]> {
  const tracked = (await upcomingRecurring(scope, today, to)).filter((u) => u.amountCents > 0);
  if (tracked.length) return tracked.map((t) => ({ date: t.date, amountCents: t.amountCents, name: t.name }));
  const deposits = await queryTransactions(scope, { from: addDaysStr(today, -120), to: today, kinds: ["income"], limit: 2000 });
  const pattern = detectRecurring(deposits)
    .filter((c) => c.averageAmountCents > 0 && c.confidence >= 0.6)
    .sort((a, b) => b.averageAmountCents - a.averageAmountCents)[0];
  if (!pattern) return [];
  const out: DatedAmount[] = [];
  const step = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 }[pattern.frequency];
  for (let d = pattern.nextExpectedDate; d <= to; d = addDaysStr(d, step))
    if (d > today) out.push({ date: d, amountCents: pattern.averageAmountCents, name: pattern.name });
  return out;
}

export async function cashForecast(scope: UserScope, today: string, days = 30) {
  const to = addDaysStr(today, days);
  const accounts = await listAccounts(scope);
  const balances = balancesOf(accounts);
  const [upcoming, pay, typical] = await series(
    () => upcomingRecurring(scope, addDaysStr(today, 1), to),
    () => expectedPay(scope, today, to),
    () => typicalDailySpend(scope, today),
  );
  const bills = upcoming.filter((u) => u.amountCents < 0).map((u) => ({ date: u.date, amountCents: u.amountCents, name: u.name }));
  const p = projectCash({ startCents: balances.cashCents, today, days, bills, income: pay, dailySpendCents: typical.dailyCents });
  const warnings: string[] = [];
  if (p.overdraftDateWithoutPay && p.overdraftDateWithPay)
    warnings.push(`At your usual pace, checking could go below $0 around ${nice(p.overdraftDateWithPay)}, even with expected pay.`);
  else if (p.overdraftDateWithoutPay)
    warnings.push(`Checking could go below $0 around ${nice(p.overdraftDateWithoutPay)} if your next paycheck is late or smaller than usual.`);
  const lowBill = bills.find((b) => p.points.find((x) => x.date === b.date)!.withPayCents < 0);
  if (lowBill) warnings.push(`${lowBill.name} (${dollars(-lowBill.amountCents)}) on ${nice(lowBill.date)} may not be covered.`);
  return {
    hasAccounts: accounts.length > 0,
    startCents: balances.cashCents,
    asOf: balances.asOf,
    range: { from: today, to, days },
    bills,
    expectedPay: pay,
    typicalDailySpendCents: typical.dailyCents,
    ...p,
    warnings,
    assumptions: [
      "Starts from checking and cash balances (savings and cards excluded).",
      `Day-to-day spending uses your average over the last ${typical.basedOnDays} days, not counting tracked bills.`,
      "Bills come from your tracked bills and subscriptions, on their next due dates.",
      pay.length ? "Expected pay is shown as a separate line and is never assumed for safe to spend." : "No regular paycheck was found, so no pay is assumed.",
    ],
  };
}

export async function safeToSpend(scope: UserScope, today: string) {
  const accounts = await listAccounts(scope);
  const balances = balancesOf(accounts);
  const pay = await expectedPay(scope, today, addDaysStr(today, 45));
  const nextPay = pay[0]?.date ?? null;
  const horizon = nextPay ?? addDaysStr(monthEnd(today), 1);
  const wkEnd = addDaysStr(weekStart(today), 6);
  // Pay can be late or smaller than usual, so bills in the next two weeks are covered from cash on hand even if payday comes first.
  const billsUntil = addDaysStr(horizon, -1) > addDaysStr(today, 14) ? addDaysStr(horizon, -1) : addDaysStr(today, 14);
  const [bills, goals, todays, week] = await series(
    () => upcomingRecurring(scope, today, billsUntil),
    () => listGoals(scope),
    () => queryTransactions(scope, { from: today, to: today, limit: 500 }),
    () => queryTransactions(scope, { from: weekStart(today), to: today, limit: 2000 }),
  );
  const billsDue = bills.filter((b) => b.amountCents < 0).reduce((s, b) => s - b.amountCents, 0);
  const days = Math.max(7, daysBetween(today, horizon));
  const goalSetAside = goals
    .filter((g) => g.status === "active" && g.monthlyPlanCents)
    .reduce((s, g) => s + Math.round(((g.monthlyPlanCents ?? 0) * days) / 30), 0);
  const calc = safeToSpendCalc({
    cashCents: balances.cashCents,
    today,
    horizon,
    billsDueCents: billsDue,
    goalSetAsideCents: goalSetAside,
    bufferCents: 0,
    spentTodayCents: summarizeCashflow(todays).netSpendingCents,
    spentThisWeekCents: summarizeCashflow(week).netSpendingCents,
    weekEnd: wkEnd,
  });
  return {
    hasAccounts: accounts.length > 0,
    ...calc,
    cashCents: balances.cashCents,
    asOf: balances.asOf,
    until: horizon,
    untilReason: nextPay ? ("next_pay" as const) : ("month_end" as const),
    nextPay: pay[0] ?? null,
    billsDueCents: billsDue,
    bills: bills.filter((b) => b.amountCents < 0),
    goalSetAsideCents: goalSetAside,
    spentTodayCents: summarizeCashflow(todays).netSpendingCents,
    billsUntil,
    method: `Cash and checking, minus bills due by ${formatDateStr(billsUntil, "MMM d")}, minus your planned goal savings, spread over ${calc.days} days.`,
  };
}

/** Early warnings for every budget, with a specific fix. */
export async function budgetWarnings(scope: UserScope, today: string) {
  const [budgets, txns] = await series(
    () => budgetStatus(scope, today),
    () => queryTransactions(scope, { from: monthStart(today), to: today, kinds: ["expense"], limit: 20_000 }),
  );
  return budgets.map((b) => {
    const inCat = txns.filter((t) => t.categoryId && b.childIds.includes(t.categoryId));
    const byMerchant = new Map<string, { name: string; cents: number; count: number }>();
    for (const t of inCat) {
      const k = merchantKey(t);
      const m = byMerchant.get(k) ?? { name: t.merchantName ?? t.description, cents: 0, count: 0 };
      m.cents -= t.amountCents;
      m.count++;
      byMerchant.set(k, m);
    }
    const top = [...byMerchant.values()].sort((a, c) => c.cents - a.cents)[0];
    const pace = budgetPace({
      category: b.categoryName,
      limitCents: b.limitCents,
      spentCents: b.spentCents,
      today,
      topMerchant: top && top.count >= 2 ? { name: top.name, avgCents: Math.round(top.cents / top.count), count: top.count } : null,
    });
    return { ...b, ...pace };
  });
}
