import { series } from "@/server/db/series";
import { addDaysStr, monthEnd, monthStart } from "@/lib/dates";
import { rangeLabel } from "@/lib/periods";
import type { UserScope } from "../../db/with-user";
import { listCategories } from "./categories";
import { rollupToParents, spendingByCategoryId, summarizeCashflow } from "./cashflow";
import { financialHealth } from "./coach";
import { budgetWarnings, safeToSpend } from "./forecast";
import { goalsWithPlans } from "./goals";
import { netWorthTrend } from "./investing";
import { budgetStatus, upcomingRecurring } from "./planning";
import { queryTransactions } from "./transactions";

/** Daily: what you spent, what's safe today, and anything due soon. */
export async function dailyCheckin(scope: UserScope, today: string) {
  const yesterday = addDaysStr(today, -1);
  const [safe, y, bills, warnings] = await series(
    () => safeToSpend(scope, today),
    () => queryTransactions(scope, { from: yesterday, to: yesterday, limit: 500 }),
    () => upcomingRecurring(scope, today, addDaysStr(today, 3)),
    () => budgetWarnings(scope, today),
  );
  return {
    date: today,
    spentYesterdayCents: summarizeCashflow(y).netSpendingCents,
    spentTodayCents: safe.spentTodayCents,
    safeToSpendTodayCents: safe.todayCents,
    safeToSpendWeekCents: safe.thisWeekCents,
    safeMethod: safe.method,
    billsNext3Days: bills.filter((b) => b.amountCents < 0),
    watch: warnings.filter((w) => w.status !== "on_track").map((w) => ({ category: w.categoryName, status: w.status, fix: w.fix })),
  };
}

/** Weekly: this week against last week, budget pace, and the week ahead. */
export async function weeklyCheckin(scope: UserScope, today: string) {
  const from = addDaysStr(today, -6);
  const prevFrom = addDaysStr(from, -7);
  const [cur, prev, warnings, bills, goals, cats] = await series(
    () => queryTransactions(scope, { from, to: today, limit: 5000 }),
    () => queryTransactions(scope, { from: prevFrom, to: addDaysStr(from, -1), limit: 5000 }),
    () => budgetWarnings(scope, today),
    () => upcomingRecurring(scope, addDaysStr(today, 1), addDaysStr(today, 7)),
    () => goalsWithPlans(scope, today),
    () => listCategories(scope),
  );
  const c = summarizeCashflow(cur);
  const p = summarizeCashflow(prev);
  return {
    range: rangeLabel(from, today),
    spentCents: c.netSpendingCents,
    previousWeekSpentCents: p.netSpendingCents,
    changeCents: c.netSpendingCents - p.netSpendingCents,
    incomeCents: c.incomeCents,
    topCategories: rollupToParents(spendingByCategoryId(cur), cats).slice(0, 4),
    budgets: warnings.map((w) => ({ category: w.categoryName, spentCents: w.spentCents, limitCents: w.limitCents, status: w.status, fix: w.fix })),
    billsNextWeek: bills.filter((b) => b.amountCents < 0),
    goals: goals.map((g) => ({ name: g.name, percent: g.percent, onTrack: g.onTrack, projectedDate: g.projectedDate })),
  };
}

/** Monthly: the full report, with net worth trend and goal progress. */
export async function monthlyReport(scope: UserScope, today: string, month?: string) {
  const m = monthStart(month ?? addDaysStr(monthStart(today), -1));
  const end = monthEnd(m) > today ? today : monthEnd(m);
  const pm = monthStart(addDaysStr(m, -1));
  const [cur, prev, cats, budgets, goals, trend] = await series(
    () => queryTransactions(scope, { from: m, to: end, limit: 20_000 }),
    () => queryTransactions(scope, { from: pm, to: monthEnd(pm), limit: 20_000 }),
    () => listCategories(scope),
    () => budgetStatus(scope, m),
    () => goalsWithPlans(scope, today),
    () => netWorthTrend(scope, today, 400),
  );
  const health = await financialHealth(scope, today);
  const c = summarizeCashflow(cur);
  const p = summarizeCashflow(prev);
  const catsNow = rollupToParents(spendingByCategoryId(cur), cats);
  const catsPrev = new Map(rollupToParents(spendingByCategoryId(prev), cats).map((x) => [x.name, x.cents]));
  const startNW = trend.find((t) => t.day >= m);
  const endNW = [...trend].reverse().find((t) => t.day <= end);
  return {
    month: m.slice(0, 7),
    range: rangeLabel(m, end),
    incomeCents: c.incomeCents,
    spentCents: c.netSpendingCents,
    savedCents: c.incomeCents - c.netSpendingCents,
    savingsRatePercent: c.incomeCents > 0 ? Math.round(((c.incomeCents - c.netSpendingCents) / c.incomeCents) * 100) : null,
    previous: { incomeCents: p.incomeCents, spentCents: p.netSpendingCents },
    categories: catsNow.slice(0, 8).map((x) => ({ name: x.name, cents: x.cents, changeCents: x.cents - (catsPrev.get(x.name) ?? 0) })),
    budgets: budgets.map((b) => ({ category: b.categoryName, spentCents: b.spentCents, limitCents: b.limitCents, within: b.remainingCents >= 0 })),
    goals: goals.map((g) => ({ name: g.name, savedCents: g.savedCents, targetCents: g.targetCents, percent: g.percent, projectedDate: g.projectedDate })),
    netWorth:
      startNW && endNW
        ? {
            startCents: startNW.netWorthCents,
            endCents: endNW.netWorthCents,
            changeCents: endNW.netWorthCents - startNW.netWorthCents,
            points: trend.map((t) => ({ day: t.day, cents: t.netWorthCents })),
          }
        : null,
    health: { score: health.score, band: health.band, nextSteps: health.nextSteps },
  };
}
