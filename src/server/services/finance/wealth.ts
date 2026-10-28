import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { financialAccounts, holdings } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { assertOwned, notFound } from "../errors";

export const holdingInputSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  symbol: z.string().trim().toUpperCase().max(12).nullish(),
  securityType: z.enum(["equity", "etf", "mutual_fund", "crypto", "bond", "cash", "other"]).default("other"),
  quantity: z.number().min(0),
  valueCents: z.number().int().min(0),
  costBasisCents: z.number().int().min(0).nullish(),
  expenseRatioBps: z.number().int().min(0).max(1000).nullish(),
});

export async function addManualHolding(scope: UserScope, input: z.input<typeof holdingInputSchema>) {
  const d = holdingInputSchema.parse(input);
  await assertOwned(scope, financialAccounts, d.accountId, "Account");
  const [row] = await scope.tx
    .insert(holdings)
    .values({ ...d, quantity: String(d.quantity), userId: scope.userId, source: "manual" })
    .returning();
  return row;
}

export async function deleteHolding(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, scope.userId), eq(holdings.source, "manual")))
    .returning({ id: holdings.id });
  if (!row) throw notFound("Holding");
}

export async function listHoldings(scope: UserScope) {
  return scope.tx.select().from(holdings).where(eq(holdings.userId, scope.userId)).orderBy(asc(holdings.accountId), asc(holdings.name));
}

/** Allocation by security type across holdings (value-weighted). */
export function allocation(rows: { securityType: string; valueCents: number }[]) {
  const total = rows.reduce((s, r) => s + r.valueCents, 0);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.securityType, (map.get(r.securityType) ?? 0) + r.valueCents);
  return [...map.entries()]
    .map(([type, cents]) => ({ type, cents, percent: total ? Math.round((cents / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

/**
 * All-time return across holdings that have a known cost basis, as a percent
 * (e.g. 12.4). Null when no holding has a cost basis.
 */
export function portfolioReturn(rows: { valueCents: number; costBasisCents: number | null }[]): number | null {
  const known = rows.filter((r) => r.costBasisCents != null && r.costBasisCents > 0);
  const cost = known.reduce((s, r) => s + r.costBasisCents!, 0);
  if (!cost) return null;
  const value = known.reduce((s, r) => s + r.valueCents, 0);
  return Math.round(((value - cost) / cost) * 1000) / 10;
}
