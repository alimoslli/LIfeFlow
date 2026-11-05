import { series } from "@/server/db/series";
import { addDaysStr, daysBetween, formatDateStr, monthEnd, monthStart } from "@/lib/dates";
import type { UserScope } from "../../db/with-user";
import { summarizeCashflow } from "./cashflow";
import { keywordCategory, needOrWant } from "./categorize";
import { listAccounts } from "./accounts";
import { balancesOf } from "./overview";
import { nameRelation } from "./bill-match";
import { bankSeries, budgetStatus, listRecurring, upcomingRecurring, type BankSeries } from "./planning";
import { detectRecurring, merchantKey, merchantKeys, nextOccurrence, type RecurringCandidate } from "./recurring-detect";
import { queryTransactions } from "./transactions";
import { listEmployers } from "../work";

/**
 * Forward-looking money math. Every result carries the inputs it used, so the
 * app and Jarvis can show the working instead of a bare verdict. Expected pay
 * is shown separately and never mixed into what is available now.
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

/** Where a budget is heading at the current pace, with a concrete fix if it's heading over. */
export function budgetPace(i: {
  category: string;
  limitCents: number;
  spentCents: number;
  today: string;
  /** Biggest merchant in this category this month that's safe to skip (`skippableMerchant`), with its typical purchase. */
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
/** $431 or $430.80, never $430.8. */
const dollars = (c: number) => {
  const d = c % 100 ? 2 : 0;
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

// ------------------------------------------------------------ data

/** Bills and subscriptions found in the bank feed that the user doesn't track yet. */
const foundBills = (bank: BankSeries) => bank.untracked.filter((c) => c.kind !== "income" && c.latestAmountCents < 0 && c.confidence >= 0.6);
/** Series that are an active tracked bill under the bank's name: their charges are that bill, not day-to-day spending. */
const trackedBills = (bank: BankSeries) => bank.trackedActive.filter((c) => c.latestAmountCents < 0);

/** Average daily day-to-day spending over the last 8 weeks, leaving out bills (they're counted on their dates). */
async function typicalDailySpend(scope: UserScope, today: string, billSeries: RecurringCandidate[] = []) {
  const from = addDaysStr(today, -56);
  const [txns, recurring] = await series(
    () => queryTransactions(scope, { from, to: addDaysStr(today, -1), limit: 20_000 }),
    () => listRecurring(scope),
  );
  const billKeys = new Set([
    ...recurring.filter((r) => r.amountCents < 0).flatMap((r) => [r.merchantKey, merchantKey({ merchantName: r.name, description: r.name })]),
    ...billSeries.map((c) => c.merchantKey),
  ]);
  const dayToDay = txns.filter((t) => !merchantKeys(t).some((k) => billKeys.has(k)));
  const spent = summarizeCashflow(dayToDay).netSpendingCents;
  const days = Math.max(1, Math.min(56, txns.length ? daysBetween(txns[txns.length - 1].date, today) : 1));
  return { dailyCents: Math.max(0, Math.round(spent / days)), basedOnDays: days };
}

/**
 * `key` names the bill and its cycle, and stays the same across days: `<tracked item id>:<due date>`, or
 * `found:<merchant key>:<expected date>` for a bill found in the bank (even while it's late and shown as due today).
 */
export type UpcomingBill = DatedAmount & { found: boolean; key: string };

/**
 * What goes out between two dates: the tracked bills not paid yet plus the ones found in the bank feed but
 * not tracked yet (`found: true`), so nothing real is left out. A found bill up to 5 days late hasn't posted
 * yet, so it still counts, dated `from`.
 */
export async function upcomingBills(scope: UserScope, today: string, from: string, to: string, bank?: BankSeries): Promise<UpcomingBill[]> {
  const b = bank ?? (await bankSeries(scope, today));
  const tracked = await upcomingRecurring(scope, from, to, b);
  const bills: UpcomingBill[] = tracked
    .filter((u) => u.amountCents < 0)
    .map((u) => ({ date: u.date, amountCents: u.amountCents, name: u.name, found: false, key: `${u.id}:${u.date}` }));
  for (const c of foundBills(b)) {
    let cycle = c.nextExpectedDate;
    const late = cycle < from && daysBetween(cycle, from) <= 5;
    for (let guard = 0; !late && cycle < from && guard < 200; guard++) cycle = nextOccurrence(cycle, c.frequency);
    for (let guard = 0; guard < 60; guard++, cycle = nextOccurrence(cycle, c.frequency)) {
      const date = cycle < from ? from : cycle;
      if (date > to) break;
      bills.push({ date, amountCents: c.latestAmountCents, name: c.name, found: true, key: `found:${c.merchantKey}:${cycle}` });
    }
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date));
}

/** What goes out between two dates (`upcomingBills`) and the usual day-to-day pace. */
export async function billsAndPace(scope: UserScope, today: string, from: string, to: string, bank?: BankSeries) {
  const b = bank ?? (await bankSeries(scope, today));
  const [bills, typical] = await series(
    () => upcomingBills(scope, today, from, to, b),
    () => typicalDailySpend(scope, today, [...foundBills(b), ...trackedBills(b)]),
  );
  return { bills, typical };
}

/** How a paycheck reads when it doesn't name the employer ("PAYROLL", "DIRECT DEP"). */
const PAYCHECK_WORDS = /\b(?:payroll|paycheck|salary|direct dep(?:osit)?|dir dep)\b/i;

/**
 * Whether income is a salaried job's own pay: named after a salaried job and no hourly one, or reading
 * like a paycheck while every job is salaried. Hourly pay and money from family or friends never are.
 */
function salaryPayOf(jobs: { name: string; payType: string }[]) {
  const keyOf = (name: string) => [merchantKey({ merchantName: name, description: name })];
  const salaried = jobs.filter((j) => j.payType === "salary").map((j) => keyOf(j.name));
  const hourly = jobs.filter((j) => j.payType !== "salary").map((j) => keyOf(j.name));
  return (name: string, keys = keyOf(name)) => {
    if (hourly.some((k) => nameRelation(k, keys))) return false;
    if (salaried.some((k) => nameRelation(k, keys))) return true;
    // A paycheck that doesn't name the job ("Paycheck", "ADP") could be the hourly job's, so with any hourly job it's never expected (on purpose: hourly pay is never predicted).
    return !hourly.length && PAYCHECK_WORDS.test(`${name} ${keys.join(" ")}`);
  };
}

/**
 * Expected pay, only when it's truly predictable: a salaried job's own paychecks, landing for the same
 * amount on a regular schedule (or a pay item the user tracks for that job). Hourly pay is never predicted:
 * hours, tips, taxes and pay periods change every time. Shown as expected, never counted as available.
 */
async function expectedPay(scope: UserScope, today: string, to: string, bank?: BankSeries): Promise<DatedAmount[]> {
  const jobs = await listEmployers(scope);
  if (!jobs.some((j) => j.payType === "salary")) return [];
  const isSalaryPay = salaryPayOf(jobs);
  const tracked = (await upcomingRecurring(scope, today, to, bank)).filter((u) => u.amountCents > 0 && isSalaryPay(u.name));
  if (tracked.length) return tracked.map((t) => ({ date: t.date, amountCents: t.amountCents, name: t.name }));
  const deposits = await queryTransactions(scope, { from: addDaysStr(today, -120), to: today, kinds: ["income"], limit: 2000 });
  const pattern = detectRecurring(deposits)
    .filter((c) => c.latestAmountCents > 0 && c.confidence >= 0.6 && !c.variableAmount && isSalaryPay(c.name, [c.merchantKey]))
    .sort((a, b) => b.latestAmountCents - a.latestAmountCents)[0];
  if (!pattern) return [];
  const out: DatedAmount[] = [];
  for (let d = pattern.nextExpectedDate; d <= to; d = nextOccurrence(d, pattern.frequency))
    if (d > today) out.push({ date: d, amountCents: pattern.latestAmountCents, name: pattern.name });
  return out;
}

export async function cashForecast(scope: UserScope, today: string, days = 30) {
  const to = addDaysStr(today, days);
  const accounts = await listAccounts(scope);
  const balances = balancesOf(accounts);
  const bank = await bankSeries(scope, today);
  const [{ bills, typical }, pay] = await series(
    () => billsAndPace(scope, today, addDaysStr(today, 1), to, bank),
    () => expectedPay(scope, today, to, bank),
  );
  const p = projectCash({ startCents: balances.cashCents, today, days, bills, income: pay, dailySpendCents: typical.dailyCents });
  const warnings: string[] = [];
  if (p.overdraftDateWithoutPay && p.overdraftDateWithPay)
    warnings.push(`At your usual pace, checking could go below $0 around ${nice(p.overdraftDateWithPay)}, even with expected pay.`);
  else if (p.overdraftDateWithoutPay)
    warnings.push(
      pay.length
        ? `Checking could go below $0 around ${nice(p.overdraftDateWithoutPay)} if your next paycheck is late or smaller than usual.`
        : `At your usual spending, checking could go below $0 around ${nice(p.overdraftDateWithoutPay)} unless more money comes in.`,
    );
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
      "Bills are your tracked bills and subscriptions plus ones found in your bank history, on their next expected dates.",
      pay.length
        ? "Expected pay (a salaried job with the same paycheck each time) is shown separately and never counted as available."
        : "No pay is assumed: pay is only predicted for a salaried job with the same paycheck each time, never for hourly work.",
    ],
  };
}

/**
 * The merchant a budget fix may suggest skipping: the biggest this month, bought at least twice, that's a want.
 * Never an essential (groceries, rent, utilities, medical, getting to work or school), by the purchase's
 * category or, when that's vague ("Food & Dining"), by the merchant's: skipping those isn't a fix anyone takes.
 */
export function skippableMerchant(txns: { merchantName: string | null; description: string; amountCents: number; categoryName?: string | null }[]) {
  const byMerchant = new Map<string, { name: string; cents: number; count: number }>();
  for (const t of txns) {
    if (needOrWant(t.categoryName) === "need" || needOrWant(keywordCategory(t)) === "need") continue;
    const k = merchantKey(t);
    const m = byMerchant.get(k) ?? { name: t.merchantName ?? t.description, cents: 0, count: 0 };
    m.cents -= t.amountCents;
    m.count++;
    byMerchant.set(k, m);
  }
  const top = [...byMerchant.values()].filter((m) => m.count >= 2).sort((a, c) => c.cents - a.cents)[0];
  return top ? { name: top.name, avgCents: Math.round(top.cents / top.count), count: top.count } : null;
}

/** Early warnings for every budget, with a specific fix. */
export async function budgetWarnings(scope: UserScope, today: string) {
  const [budgets, txns] = await series(
    () => budgetStatus(scope, today),
    () => queryTransactions(scope, { from: monthStart(today), to: today, kinds: ["expense"], limit: 20_000 }),
  );
  return budgets.map((b) => {
    const inCat = txns.filter((t) => t.categoryId && b.childIds.includes(t.categoryId));
    const pace = budgetPace({
      category: b.categoryName,
      limitCents: b.limitCents,
      spentCents: b.spentCents,
      today,
      topMerchant: skippableMerchant(inCat),
    });
    return { ...b, ...pace };
  });
}
