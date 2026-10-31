import { series } from "@/server/db/series";
import { addDaysStr, monthEnd, monthStart } from "@/lib/dates";
import { rangeLabel } from "@/lib/periods";
import type { UserScope } from "../../db/with-user";
import { listCategories } from "./categories";
import { rollupToParents, spendingByCategoryId, summarizeCashflow } from "./cashflow";
import { goalsWithPlans } from "./goals";
import { netWorthTrend } from "./investing";
import { budgetStatus } from "./planning";
import { queryTransactions } from "./transactions";

/** Daily: what you spent, what's safe today, and anything due soon. */
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
  };
}
