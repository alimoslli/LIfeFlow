/**
 * The names people see for a transaction's type. A plain module (not a "use client" one), so server pages can read it:
 * a server page that imports a value from a client file gets a reference, not the object (the Activity editor showed a
 * blank Type list, owner, 2026-11-11).
 */
export const KIND_LABELS: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer (own accounts)",
  refund: "Refund",
  reimbursement: "Reimbursement",
  investment: "Investment movement",
  adjustment: "Adjustment",
};
