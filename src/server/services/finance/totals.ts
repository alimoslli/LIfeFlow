import { and, sql } from "drizzle-orm";
import { transactions } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import type { CashflowSummary } from "./cashflow";
import { anyTextLike, baseConds, type TransactionQuery } from "./transactions";

/**
 * Totals computed in SQL over every matching row (never a capped list). The rules are exactly those of
 * `summarizeCashflow` / `spendingByCategoryId` in cashflow.ts: user-hidden rows are ignored, pending rows count,
 * income adds, expense/refund/reimbursement make net spending, transfers/investments/adjustments are not spending or income.
 * Filters are the list's own (dates, account, categories, kinds, amounts) plus a plain-substring `search`.
 */
export type TotalsQuery = Omit<TransactionQuery, "phrase" | "sureOnly" | "limit">;

/** Whole numbers only, and never a negative zero (it would print as "-$0.00"). */
const num = (x: string | number | null) => Number(x ?? 0) || 0;

async function conditions(scope: UserScope, q: TotalsQuery) {
  const conds = await baseConds(scope, q);
  if (q.search?.trim()) conds.push(anyTextLike(q.search.trim()));
  return conds;
}

const live = sql`not ${transactions.excluded}`;
const sumKind = (kind: string) => sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${live} and ${transactions.kind} = ${kind}), 0)`;

export async function cashflowTotals(
  scope: UserScope,
  q: TotalsQuery,
): Promise<Pick<CashflowSummary, "incomeCents" | "netSpendingCents" | "netCashflowCents" | "transactionCount" | "pendingCount" | "excludedCount">> {
  // Hidden rows are counted apart, never summed, whatever `includeExcluded` says.
  const [r] = await scope.tx
    .select({
      income: sumKind("income"),
      expense: sumKind("expense"),
      refund: sumKind("refund"),
      reimbursement: sumKind("reimbursement"),
      count: sql<string>`count(*) filter (where ${live})`,
      pending: sql<string>`count(*) filter (where ${live} and ${transactions.pending})`,
      hidden: sql<string>`count(*) filter (where ${transactions.excluded})`,
    })
    .from(transactions)
    .where(and(...(await conditions(scope, { ...q, includeExcluded: true }))));
  const incomeCents = num(r.income);
  const netSpendingCents = 0 - num(r.expense) - num(r.refund) - num(r.reimbursement) || 0;
  return {
    incomeCents,
    netSpendingCents,
    netCashflowCents: incomeCents - netSpendingCents || 0,
    transactionCount: num(r.count),
    pendingCount: num(r.pending),
    excludedCount: num(r.hidden),
  };
}

/** Net spending (expenses minus refunds and reimbursements) per category id, same shape as `spendingByCategoryId`. */
export async function netSpendingByCategory(scope: UserScope, q: TotalsQuery): Promise<Map<string | null, number>> {
  const rows = await scope.tx
    .select({ categoryId: transactions.categoryId, cents: sql<string>`sum(${transactions.amountCents})` })
    .from(transactions)
    .where(and(...(await conditions(scope, { ...q, includeExcluded: false })), sql`${transactions.kind} in ('expense', 'refund', 'reimbursement')`))
    .groupBy(transactions.categoryId);
  return new Map(rows.map((r) => [r.categoryId, 0 - num(r.cents) || 0]));
}

/**
 * Plain sums of the matching (not hidden) rows by direction: money out (`outCents`, what `Math.max(0, -amount)` adds up),
 * money in, the net amount, the count, and what rounding each purchase up to the next dollar would add.
 * `weekend` limits to Saturdays and Sundays (true) or Monday to Friday (false).
 */
export async function flowTotals(scope: UserScope, q: TotalsQuery & { weekend?: boolean }) {
  const conds = await conditions(scope, { ...q, includeExcluded: false });
  if (q.weekend != null)
    conds.push(q.weekend ? sql`extract(dow from ${transactions.date}) in (0, 6)` : sql`extract(dow from ${transactions.date}) not in (0, 6)`);
  const a = transactions.amountCents;
  const [r] = await scope.tx
    .select({
      out: sql<string>`coalesce(sum(greatest(0, -${a})), 0)`,
      inn: sql<string>`coalesce(sum(greatest(0, ${a})), 0)`,
      net: sql<string>`coalesce(sum(${a}), 0)`,
      count: sql<string>`count(*)`,
      roundUp: sql<string>`coalesce(sum((100 - (abs(${a}) % 100)) % 100), 0)`,
    })
    .from(transactions)
    .where(and(...conds));
  return { outCents: num(r.out), inCents: num(r.inn), netCents: num(r.net), count: num(r.count), roundUpCents: num(r.roundUp) };
}
