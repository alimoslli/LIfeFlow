import { series } from "@/server/db/series";
import { resolvePeriod, type Period } from "@/lib/periods";
import type { UserScope } from "../../db/with-user";
import { listAccounts, summarizeBalances } from "./accounts";
import { summarizeCashflow, type CashflowSummary } from "./cashflow";
import { budgetStatus } from "./planning";
import { queryTransactions } from "./transactions";
import { listHoldings, portfolioReturn } from "./wealth";

/**
 * The single source of truth for headline money numbers. Today, Money,
 * Wealth, Budgets, Transactions and Jarvis all read from here, so a number
 * shown in two places is always computed the same way over the same range.
 */

type Account = Awaited<ReturnType<typeof listAccounts>>[number];

export const isSavingsAccount = (a: Pick<Account, "type" | "subtype" | "name">) => a.type === "depository" && /saving/i.test(`${a.subtype ?? ""} ${a.name}`);

/** Balances from accounts, with the time the oldest one was last updated. */
export function balancesOf(accounts: Account[]) {
  const totals = summarizeBalances(accounts);
  const sum = (f: (a: Account) => boolean) => accounts.filter(f).reduce((s, a) => s + a.currentBalanceCents, 0);
  const investmentAccounts = accounts.filter((a) => a.type === "investment");
  return {
    /** Checking + cash (spendable). Savings are separate. */
    cashCents: sum((a) => (a.type === "depository" || a.type === "cash") && !isSavingsAccount(a)),
    savingsCents: sum(isSavingsAccount),
    creditOwedCents: totals.creditOwedCents,
    loansOwedCents: totals.loansOwedCents,
    /** Portfolio = investment account balances (holdings are a breakdown of these). */
    investmentsCents: totals.investmentsCents,
    netWorthCents: totals.netWorthCents,
    investmentAccounts,
    asOf: totals.oldestBalanceUpdate,
    hasDemoData: accounts.some((a) => a.source === "demo"),
  };
}

export type CashflowForPeriod = Pick<CashflowSummary, "incomeCents" | "netSpendingCents" | "netCashflowCents" | "transactionCount" | "pendingCount"> & {
  period: Period;
};

/** Spending and income over a named range, with the same rules everywhere. */
export async function cashflowFor(scope: UserScope, period: Period): Promise<CashflowForPeriod> {
  const txns = await queryTransactions(scope, { from: period.from, to: period.to, limit: 20_000 });
  const s = summarizeCashflow(txns);
  return {
    period,
    incomeCents: s.incomeCents,
    netSpendingCents: s.netSpendingCents,
    netCashflowCents: s.netCashflowCents,
    transactionCount: s.transactionCount,
    pendingCount: s.pendingCount,
  };
}

export async function moneyOverview(scope: UserScope, today: string) {
  const period = resolvePeriod("month", today);
  const accounts = await listAccounts(scope);
  const balances = balancesOf(accounts);
  const [month, budgets, holdings] = await series(
    () => cashflowFor(scope, period),
    () => budgetStatus(scope, today),
    () => (balances.investmentAccounts.length ? listHoldings(scope) : Promise.resolve([])),
  );
  const budgetedSpent = budgets.reduce((s, b) => s + b.spentCents, 0);
  return {
    hasAccounts: accounts.length > 0,
    balances,
    month,
    budgets: {
      period,
      count: budgets.length,
      limitCents: budgets.reduce((s, b) => s + b.limitCents, 0),
      /** Spending in categories that have a budget. */
      budgetedSpentCents: budgetedSpent,
      /** Everything else, so budgeted + unbudgeted = the month's spending. */
      unbudgetedSpentCents: month.netSpendingCents - budgetedSpent,
      items: budgets,
    },
    investments: balances.investmentAccounts.length
      ? {
          valueCents: balances.investmentsCents,
          holdingsValueCents: holdings.reduce((s, h) => s + h.valueCents, 0),
          holdingsCount: holdings.length,
          returnPct: portfolioReturn(holdings),
          asOf: balances.investmentAccounts.reduce<Date | null>((m, a) => (!m || a.balanceUpdatedAt < m ? a.balanceUpdatedAt : m), null),
        }
      : null,
  };
}
export type MoneyOverview = Awaited<ReturnType<typeof moneyOverview>>;
