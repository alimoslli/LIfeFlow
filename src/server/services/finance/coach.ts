import { series } from "@/server/db/series";
import { addDaysStr, daysBetween, monthEnd, monthStart } from "@/lib/dates";
import type { UserScope } from "../../db/with-user";
import { listAccounts } from "./accounts";
import { listCategories } from "./categories";
import { needOrWant } from "./categorize";
import { rollupToParents, spendingByCategoryId, summarizeCashflow } from "./cashflow";
import { cashForecast } from "./forecast";
import { goalsWithPlans } from "./goals";
import { balancesOf } from "./overview";
import { budgetStatus, listRecurring, suggestRecurring, upcomingRecurring } from "./planning";
import { queryTransactions } from "./transactions";

/**
 * Coaching math. Everything here is computed from the user's records and
 * returns its inputs; nothing is estimated when a real number exists.
 */

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const yearlyFactor = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 } as const;

/** The last three full months of activity, used as "your typical month". */
async function lastThreeMonths(scope: UserScope, today: string) {
  const end = addDaysStr(monthStart(today), -1);
  const start = monthStart(addDaysStr(monthStart(addDaysStr(monthStart(end), -1)), -1));
  const txns = await queryTransactions(scope, { from: start, to: end, limit: 20_000 });
  const months = Math.max(1, new Set(txns.map((t) => t.date.slice(0, 7))).size);
  return { txns, months, from: start, to: end, hasData: txns.length > 0 };
}

// ------------------------------------------------------------ paycheck planner

/**
 * Splits a paycheck across bills due before the next one, budgets for that
 * stretch, goals, and savings. What's left is free to spend.
 */
export async function planPaycheck(scope: UserScope, today: string, amountCents: number, opts: { nextPayDate?: string; savingsPercent?: number } = {}) {
  const next = opts.nextPayDate ?? addDaysStr(today, 14);
  const days = Math.max(1, daysBetween(today, next));
  const [bills, budgets, goals] = await series(
    () => upcomingRecurring(scope, today, addDaysStr(next, -1)),
    () => budgetStatus(scope, today),
    () => goalsWithPlans(scope, today),
  );
  const billLines = bills.filter((b) => b.amountCents < 0).map((b) => ({ name: b.name, date: b.date, cents: -b.amountCents }));
  const billTotal = billLines.reduce((s, b) => s + b.cents, 0);
  const share = Math.min(1, days / 30.44);
  const budgetLines = budgets.map((b) => ({
    name: b.categoryName,
    cents: Math.max(0, Math.round(Math.min(b.limitCents * share, Math.max(0, b.remainingCents)))),
  }));
  const budgetTotal = budgetLines.reduce((s, b) => s + b.cents, 0);
  const goalLines = goals
    .filter((g) => g.status === "active" && g.remainingCents > 0 && (g.monthlyPlanCents || g.monthlyNeededCents))
    .map((g) => ({ name: g.name, cents: Math.round((g.monthlyPlanCents ?? g.monthlyNeededCents ?? 0) * share) }));
  const goalTotal = goalLines.reduce((s, g) => s + g.cents, 0);
  const savingsPercent = opts.savingsPercent ?? (goalTotal ? 0 : 10);
  const afterEssentials = amountCents - billTotal - budgetTotal - goalTotal;
  const savingsCents = Math.max(0, Math.round((amountCents * savingsPercent) / 100));
  const free = afterEssentials - savingsCents;
  return {
    paycheckCents: amountCents,
    coversUntil: next,
    bills: billLines,
    billsCents: billTotal,
    budgets: budgetLines.filter((b) => b.cents > 0),
    budgetsCents: budgetTotal,
    goals: goalLines,
    goalsCents: goalTotal,
    savingsPercent,
    savingsCents,
    freeToSpendCents: free,
    short: free < 0,
    advice:
      free < 0
        ? `This paycheck is ${usd(-free)} short of covering everything until ${next}. Lower a budget or a goal amount for this stretch, and keep bills first.`
        : `After bills, budgets${goalLines.length ? ", goals" : ""} and ${savingsPercent}% savings, ${usd(free)} is free to spend until ${next}.`,
  };
}

// ------------------------------------------------------------ subscriptions

export async function subscriptionReport(scope: UserScope, today: string) {
  const [tracked, detected, recent] = await series(
    () => listRecurring(scope),
    () => suggestRecurring(scope, today),
    () => queryTransactions(scope, { from: addDaysStr(today, -200), to: today, kinds: ["expense"], limit: 20_000 }),
  );
  const items = [
    ...tracked
      .filter((r) => r.amountCents < 0 && (r.kind === "subscription" || r.kind === "bill"))
      .map((r) => ({ name: r.name, kind: r.kind, frequency: r.frequency, amountCents: -r.amountCents, tracked: true, merchantKey: r.merchantKey })),
    ...detected
      .filter((d) => d.averageAmountCents < 0)
      .map((d) => ({
        name: d.name,
        kind: "detected" as const,
        frequency: d.frequency,
        amountCents: -d.averageAmountCents,
        tracked: false,
        merchantKey: d.merchantKey,
      })),
  ].map((i) => ({ ...i, yearlyCents: i.amountCents * yearlyFactor[i.frequency] }));
  // Price increases: the latest charge is higher than the earliest in the window.
  const priceChanges = items.flatMap((i) => {
    const charges = recent.filter((t) => i.merchantKey && (t.merchantName ?? t.description).toLowerCase().includes(i.name.toLowerCase().split(" ")[0]));
    if (charges.length < 2) return [];
    const latest = -charges[0].amountCents;
    const earliest = -charges[charges.length - 1].amountCents;
    return latest > earliest + 50 ? [{ name: i.name, fromCents: earliest, toCents: latest }] : [];
  });
  const streaming = items.filter((i) => /netflix|hulu|disney|max|spotify|apple music|youtube|paramount|peacock/i.test(i.name));
  const subs = items.filter((i) => i.kind !== "bill");
  return {
    items: items.sort((a, b) => b.yearlyCents - a.yearlyCents),
    subscriptionsYearlyCents: subs.reduce((s, i) => s + i.yearlyCents, 0),
    priceChanges,
    overlaps:
      streaming.length >= 3 ? [{ group: "Streaming", names: streaming.map((s) => s.name), yearlyCents: streaming.reduce((s, i) => s + i.yearlyCents, 0) }] : [],
    studentPlans: subs
      .filter((i) => /spotify|apple music|youtube|amazon|prime|hulu|adobe|notion|github|microsoft|chegg/i.test(i.name))
      .map((i) => ({ name: i.name, note: `${i.name} has offered a student plan. Check the current student price on their official site before switching.` })),
    note: "Cancel only what you don't use. Yearly cost = the charge times how often it repeats.",
  };
}

// ------------------------------------------------------------ debts and credit

export async function debtReport(scope: UserScope, today: string, extraMonthlyCents = 0) {
  const accounts = await listAccounts(scope);
  const debts = accounts
    .filter((a) => (a.type === "credit" || a.type === "loan") && a.currentBalanceCents > 0)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balanceCents: a.currentBalanceCents,
      aprPercent: a.aprBps != null ? a.aprBps / 100 : null,
      minPaymentCents: a.minPaymentCents,
      nextDueDate: a.nextPaymentDueDate,
      limitCents: a.creditLimitCents,
      utilizationPercent: a.type === "credit" && a.creditLimitCents ? Math.round((a.currentBalanceCents / a.creditLimitCents) * 100) : null,
    }));
  const cards = debts.filter((d) => d.type === "credit" && d.limitCents);
  const totalLimit = cards.reduce((s, c) => s + (c.limitCents ?? 0), 0);
  const overallUtilization = totalLimit ? Math.round((cards.reduce((s, c) => s + c.balanceCents, 0) / totalLimit) * 100) : null;
  const known = debts.filter((d) => d.aprPercent != null);
  // Avalanche: highest rate first saves the most interest. Snowball: smallest balance first for quick wins.
  const avalanche = [...known].sort((a, b) => b.aprPercent! - a.aprPercent!).map((d) => d.name);
  const snowball = [...debts].sort((a, b) => a.balanceCents - b.balanceCents).map((d) => d.name);
  const payoff = simulatePayoff(
    known.map((d) => ({
      name: d.name,
      balanceCents: d.balanceCents,
      apr: d.aprPercent!,
      minCents: d.minPaymentCents ?? Math.max(2500, Math.round(d.balanceCents * 0.02)),
    })),
    extraMonthlyCents,
  );
  return {
    debts,
    totalOwedCents: debts.reduce((s, d) => s + d.balanceCents, 0),
    overallUtilizationPercent: overallUtilization,
    utilizationNote:
      overallUtilization == null
        ? "Add credit limits to your cards to see utilization."
        : overallUtilization <= 10
          ? "Under 10% utilization is excellent for your credit score."
          : overallUtilization <= 30
            ? "Under 30% is good. Lower is better for your score."
            : "Above 30% can lower your credit score. Paying the balance down before the statement date helps.",
    avalancheOrder: avalanche,
    snowballOrder: snowball,
    payoff,
    missingRates: debts.filter((d) => d.aprPercent == null).map((d) => d.name),
    creditBasics: [
      "Pay at least the minimum on time, every time: payment history is the biggest part of a credit score.",
      "Keep card balances low compared with limits (utilization).",
      "Older accounts help; think twice before closing your oldest card.",
      "Only apply for new credit when you need it.",
    ],
    asOf: today,
  };
}

/** Month-by-month payoff with minimums plus an extra amount going to the highest rate first. Pure. */
export function simulatePayoff(debts: { name: string; balanceCents: number; apr: number; minCents: number }[], extraMonthlyCents: number) {
  if (!debts.length) return null;
  const ds = debts.map((d) => ({ ...d }));
  let month = 0;
  let interest = 0;
  while (ds.some((d) => d.balanceCents > 0) && month < 600) {
    month++;
    let extra = extraMonthlyCents;
    for (const d of ds) {
      if (d.balanceCents <= 0) continue;
      const i = Math.round((d.balanceCents * d.apr) / 100 / 12);
      interest += i;
      d.balanceCents += i;
    }
    for (const d of ds) {
      if (d.balanceCents <= 0) continue;
      const pay = Math.min(d.balanceCents, d.minCents);
      d.balanceCents -= pay;
    }
    for (const d of [...ds].sort((a, b) => b.apr - a.apr)) {
      if (d.balanceCents <= 0 || extra <= 0) continue;
      const pay = Math.min(d.balanceCents, extra);
      d.balanceCents -= pay;
      extra -= pay;
    }
    if (month === 600)
      return { months: null, interestCents: interest, note: "At these payments the balance doesn't go down. Paying more than the interest is needed." };
  }
  return { months: month, interestCents: interest, note: null };
}

// ------------------------------------------------------------ emergency fund, round-ups

export async function emergencyFundPlan(scope: UserScope, today: string, targetMonths = 3) {
  const [accounts, hist] = await series(
    () => listAccounts(scope),
    () => lastThreeMonths(scope, today),
  );
  const cats = await listCategories(scope);
  const b = balancesOf(accounts);
  const byCat = rollupToParents(spendingByCategoryId(hist.txns), cats);
  const essentials = Math.round(byCat.filter((c) => needOrWant(c.name) === "need").reduce((s, c) => s + c.cents, 0) / hist.months);
  const target = essentials * targetMonths;
  const have = b.savingsCents;
  const gap = Math.max(0, target - have);
  return {
    hasData: hist.hasData,
    essentialMonthlyCents: essentials,
    targetMonths,
    targetCents: target,
    savedCents: have,
    monthsCovered: essentials ? Math.round((have / essentials) * 10) / 10 : null,
    gapCents: gap,
    monthlyToReachIn12Cents: Math.ceil(gap / 12),
    based: `Essentials (housing, groceries, transport, health, phone, insurance, education) averaged ${usd(essentials)} a month over ${hist.months} month${hist.months === 1 ? "" : "s"}. Savings = accounts named or typed as savings.`,
    challenges: [
      { name: "52-week challenge", detail: "Save $1 in week 1, $2 in week 2, and so on: $1,378 in a year." },
      { name: "No-spend weekend", detail: "One weekend a month with no wants spending. Jarvis can count what it saved." },
      { name: "Round-ups", detail: "Move the round-up total to savings once a month (shown below)." },
    ],
  };
}

/** What rounding every card/debit purchase up to the next dollar would have saved last month. Pure-ish (reads data). */
export async function roundUps(scope: UserScope, today: string) {
  const from = monthStart(addDaysStr(monthStart(today), -1));
  const txns = await queryTransactions(scope, { from, to: monthEnd(from), kinds: ["expense"], limit: 20_000 });
  const cents = txns.reduce((s, t) => s + ((100 - (Math.abs(t.amountCents) % 100)) % 100), 0);
  return { month: from.slice(0, 7), purchases: txns.length, roundUpCents: cents, yearlyCents: cents * 12 };
}

// ------------------------------------------------------------ financial health score

type Factor = { key: string; label: string; score: number; max: number; detail: string; step: string | null };

export async function financialHealth(scope: UserScope, today: string) {
  const [accounts, hist, forecast, budgets] = await series(
    () => listAccounts(scope),
    () => lastThreeMonths(scope, today),
    () => cashForecast(scope, today, 30),
    () => budgetStatus(scope, addDaysStr(monthStart(today), -1)),
  );
  const ef = await emergencyFundPlan(scope, today);
  const debts = await debtReport(scope, today);
  const b = balancesOf(accounts);
  const flow = summarizeCashflow(hist.txns);
  const factors: Factor[] = [];
  if (hist.hasData && flow.incomeCents > 0) {
    const rate = (flow.incomeCents - flow.netSpendingCents) / flow.incomeCents;
    const pts = Math.round(Math.max(0, Math.min(1, rate / 0.2)) * 25);
    factors.push({
      key: "savings_rate",
      label: "Saving part of income",
      score: pts,
      max: 25,
      detail: `You kept ${Math.round(rate * 100)}% of income over the last ${hist.months} month${hist.months === 1 ? "" : "s"}.`,
      step: rate >= 0.2 ? null : "Aim to keep 20% of each paycheck. Start with 5% and raise it as bills allow.",
    });
  }
  if (ef.essentialMonthlyCents > 0) {
    const months = ef.monthsCovered ?? 0;
    factors.push({
      key: "emergency_fund",
      label: "Emergency fund",
      score: Math.round(Math.min(1, months / 3) * 25),
      max: 25,
      detail: `Savings cover ${months} month${months === 1 ? "" : "s"} of essentials.`,
      step:
        months >= 3 ? null : `Build toward ${usd(ef.targetCents)} (3 months of essentials). ${usd(ef.monthlyToReachIn12Cents)} a month gets there in a year.`,
    });
  }
  factors.push({
    key: "cash_cushion",
    label: "No overdraft ahead",
    score: forecast.overdraftDateWithPay ? 0 : forecast.overdraftDateWithoutPay ? 8 : 15,
    max: 15,
    detail: forecast.overdraftDateWithPay
      ? "Checking is projected to go below $0 in the next 30 days."
      : forecast.overdraftDateWithoutPay
        ? "Checking stays positive only if your next paycheck arrives on time."
        : "Checking stays positive for the next 30 days at your usual pace.",
    step: forecast.overdraftDateWithoutPay ? "Keep a buffer of one week of spending in checking." : null,
  });
  if (debts.overallUtilizationPercent != null) {
    const u = debts.overallUtilizationPercent;
    factors.push({
      key: "credit_utilization",
      label: "Card balances vs limits",
      score: u <= 10 ? 15 : u <= 30 ? 11 : u <= 50 ? 6 : 2,
      max: 15,
      detail: `${u}% of your card limits is in use.`,
      step: u <= 30 ? null : "Pay cards down below 30% of their limits, ideally before the statement date.",
    });
  }
  if (b.creditOwedCents + b.loansOwedCents > 0 && flow.incomeCents > 0) {
    const monthlyIncome = flow.incomeCents / hist.months;
    const ratio = (b.creditOwedCents + b.loansOwedCents) / (monthlyIncome * 12);
    factors.push({
      key: "debt_load",
      label: "Debt compared with income",
      score: ratio < 0.2 ? 10 : ratio < 0.5 ? 6 : ratio < 1 ? 3 : 0,
      max: 10,
      detail: `Debts are ${Math.round(ratio * 100)}% of a year's income.`,
      step: ratio < 0.2 ? null : `Put extra toward the highest-rate debt first${debts.avalancheOrder[0] ? ` (${debts.avalancheOrder[0]})` : ""}.`,
    });
  }
  if (budgets.length) {
    const within = budgets.filter((x) => x.remainingCents >= 0).length / budgets.length;
    factors.push({
      key: "budgets",
      label: "Staying within budgets",
      score: Math.round(within * 10),
      max: 10,
      detail: `Last month you stayed within ${Math.round(within * 100)}% of your budgets.`,
      step: within >= 0.8 ? null : "Pick the budget you went over most and set a weekly check-in for it.",
    });
  }
  const max = factors.reduce((s, f) => s + f.max, 0);
  const score = max ? Math.round((factors.reduce((s, f) => s + f.score, 0) / max) * 100) : null;
  return {
    score,
    band: score == null ? null : score >= 80 ? "Strong" : score >= 60 ? "Good" : score >= 40 ? "Building" : "Needs attention",
    factors,
    nextSteps: factors
      .filter((f) => f.step)
      .sort((a, c) => c.max - c.score - (a.max - a.score))
      .map((f) => f.step!)
      .slice(0, 3),
    note:
      max < 50
        ? "Only some factors could be scored with the data you have. Add accounts, card limits and a few months of transactions for a full score."
        : "A simple score from your own data, to show what to work on next. It isn't a credit score.",
  };
}
