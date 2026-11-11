import { and, eq, gte, lte, sql } from "drizzle-orm";
import { transactions } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import type { CashflowSummary } from "./cashflow";

/**
 * Totals computed in SQL over every matching row (never a capped list). The rules are exactly those of
 * `summarizeCashflow` / `spendingByCategoryId` in cashflow.ts: user-hidden rows are ignored, pending rows count,
 * income adds, expense/refund/reimbursement make net spending, transfers/investments/adjustments are not spending or income.
 */
const range = (scope: UserScope, from: string, to: string) =>
  and(eq(transactions.userId, scope.userId), eq(transactions.excluded, false), gte(transactions.date, from), lte(transactions.date, to));

const sumWhere = (kind: string) => sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = ${kind}), 0)`;

export async function cashflowTotals(
  scope: UserScope,
  from: string,
  to: string,
): Promise<Pick<CashflowSummary, "incomeCents" | "netSpendingCents" | "netCashflowCents" | "transactionCount" | "pendingCount">> {
  const [r] = await scope.tx
    .select({
      income: sumWhere("income"),
      expense: sumWhere("expense"),
      refund: sumWhere("refund"),
      reimbursement: sumWhere("reimbursement"),
      count: sql<string>`count(*)`,
      pending: sql<string>`count(*) filter (where ${transactions.pending})`,
    })
    .from(transactions)
    .where(range(scope, from, to));
  const incomeCents = Number(r.income);
  const netSpendingCents = -Number(r.expense) - Number(r.refund) - Number(r.reimbursement);
  return {
    incomeCents,
    netSpendingCents,
    netCashflowCents: incomeCents - netSpendingCents,
    transactionCount: Number(r.count),
    pendingCount: Number(r.pending),
  };
}

/** Net spending (expenses minus refunds and reimbursements) per category id, same shape as `spendingByCategoryId`. */
export async function netSpendingByCategory(scope: UserScope, from: string, to: string): Promise<Map<string | null, number>> {
  const rows = await scope.tx
    .select({ categoryId: transactions.categoryId, cents: sql<string>`-sum(${transactions.amountCents})` })
    .from(transactions)
    .where(and(range(scope, from, to), sql`${transactions.kind} in ('expense', 'refund', 'reimbursement')`))
    .groupBy(transactions.categoryId);
  return new Map(rows.map((r) => [r.categoryId, Number(r.cents)]));
}
