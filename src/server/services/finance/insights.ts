import { series } from "@/server/db/series";
import { addDaysStr, daysBetween } from "@/lib/dates";
import type { UserScope } from "../../db/with-user";
import { listAccounts, summarizeBalances } from "./accounts";
import { listCategories } from "./categories";
import { rollupToParents, spendingByCategoryId, summarizeCashflow } from "./cashflow";
import { billsAndPace } from "./forecast";
import { isSavingsAccount } from "./overview";
import { merchantDisplayName, merchantKey } from "./recurring-detect";
import { queryTransactions, type TransactionQuery } from "./transactions";

/** Everything Jarvis needs to answer "how much did I spend/earn on X between A and B". */
export async function spendingSummary(scope: UserScope, q: TransactionQuery & { from: string; to: string }) {
  const found = await queryTransactions(scope, { ...q, limit: 5000 });
  // Totals count only rows that matched as the same words; the rest (a shortened name, an initial) are reported apart.
  const txns = found.filter((t) => t.sure);
  const unsure = found.filter((t) => !t.sure);
  const unconfirmed = { count: unsure.length, cents: unsure.reduce((n, t) => n + Math.max(0, -t.amountCents), 0) };
  const cats = await listCategories(scope);
  const summary = summarizeCashflow(txns);
  const byCategory = rollupToParents(spendingByCategoryId(txns), cats).slice(0, 10);
  const merchants = new Map<string, { name: string; cents: number; count: number }>();
  for (const t of txns) {
    if (t.kind !== "expense" || t.excluded) continue;
    const k = merchantKey(t);
    const m = merchants.get(k) ?? { name: merchantDisplayName(t), cents: 0, count: 0 };
    m.cents += -t.amountCents;
    m.count++;
    merchants.set(k, m);
  }
  const sources = [...new Set(txns.map((t) => t.source))];
  return {
    range: { from: q.from, to: q.to, days: daysBetween(q.from, q.to) + 1 },
    filters: { category: q.categoryName ?? null, search: q.search ?? null, accountId: q.accountId ?? null },
    ...summary,
    unconfirmed,
    topCategories: byCategory,
    topMerchants: [...merchants.values()].sort((a, b) => b.cents - a.cents).slice(0, 8),
    dataSources: sources,
    method:
      "Spending = expenses minus refunds and reimbursements. Transfers between your own accounts and investment movements are excluded. Pending transactions are included and counted separately.",
  };
}

/** Compares a period with the equally long period right before it, by category and merchant. */
export async function compareSpending(scope: UserScope, from: string, to: string) {
  const len = daysBetween(from, to) + 1;
  const prevTo = addDaysStr(from, -1);
  const prevFrom = addDaysStr(prevTo, -(len - 1));
  const [cur, prev] = await series(
    () => spendingSummary(scope, { from, to }),
    () => spendingSummary(scope, { from: prevFrom, to: prevTo }),
  );
  const prevByName = new Map(prev.topCategories.map((c) => [c.name, c.cents]));
  const names = new Set([...cur.topCategories.map((c) => c.name), ...prev.topCategories.map((c) => c.name)]);
  const changes = [...names]
    .map((name) => {
      const now = cur.topCategories.find((c) => c.name === name)?.cents ?? 0;
      const before = prevByName.get(name) ?? 0;
      return { category: name, currentCents: now, previousCents: before, changeCents: now - before };
    })
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents));
  return {
    current: { from, to, netSpendingCents: cur.netSpendingCents, incomeCents: cur.incomeCents },
    previous: { from: prevFrom, to: prevTo, netSpendingCents: prev.netSpendingCents, incomeCents: prev.incomeCents },
    changeCents: cur.netSpendingCents - prev.netSpendingCents,
    categoryChanges: changes.slice(0, 8),
    topMerchantsNow: cur.topMerchants.slice(0, 5),
  };
}

/**
 * Facts for "can I afford $X by <date>?". Returns the inputs and a simple
 * projection; Jarvis explains it rather than issuing a verdict blindly.
 */
export async function affordability(scope: UserScope, amountCents: number, today: string, byDate?: string) {
  const horizon = byDate ?? addDaysStr(today, 14);
  const accounts = await listAccounts(scope);
  const balances = summarizeBalances(accounts);
  const { bills, typical } = await billsAndPace(scope, today, today, horizon);
  const upcomingBills = bills.reduce((s, u) => s - u.amountCents, 0);
  const dailyRate = typical.dailyCents;
  const days = Math.max(0, daysBetween(today, horizon));
  const projectedDiscretionary = dailyRate * days;
  const projectedCashAfter = balances.cashCents - upcomingBills - projectedDiscretionary - amountCents;
  // The verdict is ours, not the model's (owner, 2026-11-10: asked twice, the same question got "wait" once and "yes" once).
  // It starts from Available now, the number on Money (checking + cash; savings apart), takes off the bills and usual
  // spending to the date and the purchase, and says yes, only by moving savings, or no. Income never counts.
  const spendable = (a: (typeof accounts)[number]) => (a.type === "depository" || a.type === "cash") && !isSavingsAccount(a);
  const availableNowCents = accounts.filter(spendable).reduce((n, a) => n + a.currentBalanceCents, 0);
  const savingsCents = accounts.filter(isSavingsAccount).reduce((n, a) => n + a.currentBalanceCents, 0);
  const availableAfterCents = availableNowCents - upcomingBills - projectedDiscretionary - amountCents;
  const verdict: "yes" | "only_with_savings" | "no" | "unknown" = !accounts.length
    ? "unknown"
    : availableAfterCents >= 0
      ? "yes"
      : availableAfterCents + savingsCents >= 0
        ? "only_with_savings"
        : "no";
  return {
    verdict,
    availableNowCents,
    availableAfterCents,
    savingsCents,
    amountCents,
    horizon: { from: today, to: horizon, days },
    liquidCashCents: balances.cashCents,
    creditCardOwedCents: balances.creditOwedCents,
    // Named `bills`, not `upcomingBills`: the dollars conversion turns upcomingBillsCents into upcomingBills and would overwrite the list.
    bills: bills.map((b) => ({ ...b, amountCents: -b.amountCents })),
    upcomingBillsCents: upcomingBills,
    averageDailySpendingCents: dailyRate,
    projectedDiscretionaryCents: projectedDiscretionary,
    projectedCashAfterPurchaseCents: projectedCashAfter,
    hasAccounts: accounts.length > 0,
    assumptions: [
      "Liquid cash = checking, savings and cash accounts at their last known balance.",
      "Upcoming bills are tracked bills plus ones found in your bank history (found: true). Income is not projected: pay counts only once it reaches your account.",
      `Day-to-day spending is projected at your average over the last ${typical.basedOnDays} days, not counting bills, for ${days} days.`,
      "Credit card balances are shown but not subtracted, since they may not be due before the date.",
    ],
  };
}
