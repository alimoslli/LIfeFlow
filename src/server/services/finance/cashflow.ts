import type { TransactionKind } from "../../db/schema";

/**
 * Pure cash-flow math. Sign convention: amountCents > 0 is money in,
 * < 0 is money out.
 *
 * - income:         counts toward income (a negative income row, e.g. a
 *                   reversed paycheck, reduces income)
 * - expense:        counts toward spending
 * - refund / reimbursement: offsets spending; never counts as income
 * - transfer:       between the user's own accounts; excluded from both
 * - investment:     contributions/withdrawals; reported separately
 * - adjustment:     ignored
 * - excluded rows (user-hidden) are ignored entirely.
 */
export type CashflowTxn = {
  amountCents: number;
  kind: TransactionKind;
  pending: boolean;
  excluded: boolean;
  categoryId: string | null;
};

export type CashflowSummary = {
  incomeCents: number;
  grossSpendingCents: number;
  refundsCents: number;
  reimbursementsCents: number;
  netSpendingCents: number;
  netCashflowCents: number;
  transfersInCents: number;
  transfersOutCents: number;
  investmentContributionsCents: number;
  investmentWithdrawalsCents: number;
  transactionCount: number;
  pendingCount: number;
  excludedCount: number;
};

export function summarizeCashflow(txns: CashflowTxn[], opts: { includePending?: boolean } = {}): CashflowSummary {
  const includePending = opts.includePending ?? true;
  const s: CashflowSummary = {
    incomeCents: 0,
    grossSpendingCents: 0,
    refundsCents: 0,
    reimbursementsCents: 0,
    netSpendingCents: 0,
    netCashflowCents: 0,
    transfersInCents: 0,
    transfersOutCents: 0,
    investmentContributionsCents: 0,
    investmentWithdrawalsCents: 0,
    transactionCount: 0,
    pendingCount: 0,
    excludedCount: 0,
  };
  for (const t of txns) {
    if (t.excluded) {
      s.excludedCount++;
      continue;
    }
    if (t.pending) {
      s.pendingCount++;
      if (!includePending) continue;
    }
    s.transactionCount++;
    const a = t.amountCents;
    switch (t.kind) {
      case "income":
        s.incomeCents += a;
        break;
      case "expense":
        s.grossSpendingCents += -a; // a positive "expense" (rare) reduces spending
        break;
      case "refund":
        s.refundsCents += a;
        break;
      case "reimbursement":
        s.reimbursementsCents += a;
        break;
      case "transfer":
        if (a > 0) s.transfersInCents += a;
        else s.transfersOutCents += -a;
        break;
      case "investment":
        if (a < 0) s.investmentContributionsCents += -a;
        else s.investmentWithdrawalsCents += a;
        break;
      case "adjustment":
        break;
    }
  }
  s.netSpendingCents = s.grossSpendingCents - s.refundsCents - s.reimbursementsCents;
  s.netCashflowCents = s.incomeCents - s.netSpendingCents;
  return s;
}

/** Net spending (expenses minus refunds/reimbursements) per category id. */
export function spendingByCategoryId(txns: CashflowTxn[], opts: { includePending?: boolean } = {}) {
  const includePending = opts.includePending ?? true;
  const map = new Map<string | null, number>();
  for (const t of txns) {
    if (t.excluded || (t.pending && !includePending)) continue;
    if (t.kind !== "expense" && t.kind !== "refund" && t.kind !== "reimbursement") continue;
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) - t.amountCents);
  }
  return map;
}

type Cat = { id: string; name: string; parentId: string | null; color: string | null };

/** Rolls category spending up to top-level categories. */
export function rollupToParents(byCategory: Map<string | null, number>, cats: Cat[]) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const top = (id: string | null): Cat | null => {
    let c = id ? byId.get(id) : undefined;
    while (c?.parentId && byId.has(c.parentId)) c = byId.get(c.parentId);
    return c ?? null;
  };
  const out = new Map<string, { id: string | null; name: string; color: string | null; cents: number }>();
  for (const [id, cents] of byCategory) {
    const t = top(id);
    const key = t?.id ?? "uncategorized";
    const cur = out.get(key) ?? { id: t?.id ?? null, name: t?.name ?? "Uncategorized", color: t?.color ?? "#94a3b8", cents: 0 };
    cur.cents += cents;
    out.set(key, cur);
  }
  return [...out.values()].filter((r) => r.cents !== 0).sort((a, b) => b.cents - a.cents);
}

/** Groups cash flow by YYYY-MM. */
export function monthlyCashflow<T extends CashflowTxn & { date: string }>(txns: T[]) {
  const months = new Map<string, T[]>();
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(t);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({ month, ...summarizeCashflow(list) }));
}
