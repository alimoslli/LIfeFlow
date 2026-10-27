import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { financialAccounts, type AccountType } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { notFound } from "../errors";

export const ACCOUNT_TYPES = ["depository", "credit", "loan", "investment", "cash", "other"] as const;

export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().trim().max(60).nullish(),
  institutionName: z.string().trim().max(120).nullish(),
  mask: z.string().trim().regex(/^\d{2,4}$/).nullish().or(z.literal("").transform(() => null)),
  currentBalanceCents: z.number().int(),
  creditLimitCents: z.number().int().min(0).nullish(),
  includeInNetWorth: z.boolean().default(true),
});

export async function createManualAccount(scope: UserScope, input: z.input<typeof accountInputSchema>, source: "manual" | "demo" = "manual") {
  const d = accountInputSchema.parse(input);
  const [row] = await scope.tx
    .insert(financialAccounts)
    .values({ ...d, userId: scope.userId, source, availableBalanceCents: d.type === "depository" ? d.currentBalanceCents : null })
    .returning();
  return row;
}

export async function updateAccountBalance(scope: UserScope, id: string, currentBalanceCents: number) {
  const [row] = await scope.tx
    .update(financialAccounts)
    .set({ currentBalanceCents, balanceUpdatedAt: new Date() })
    .where(and(eq(financialAccounts.id, id), eq(financialAccounts.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Account");
  return row;
}

export async function archiveAccount(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .update(financialAccounts)
    .set({ archivedAt: new Date() })
    .where(and(eq(financialAccounts.id, id), eq(financialAccounts.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Account");
  return row;
}

export async function listAccounts(scope: UserScope, opts: { types?: AccountType[] } = {}) {
  const rows = await scope.tx
    .select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.userId, scope.userId), isNull(financialAccounts.archivedAt)))
    .orderBy(asc(financialAccounts.type), asc(financialAccounts.name));
  return opts.types ? rows.filter((r) => opts.types!.includes(r.type)) : rows;
}

/** Debts (credit/loan) are stored as positive owed balances and subtracted. */
export function signedBalance(a: { type: AccountType; currentBalanceCents: number }) {
  return a.type === "credit" || a.type === "loan" ? -a.currentBalanceCents : a.currentBalanceCents;
}

export type BalanceSummary = {
  cashCents: number;
  creditOwedCents: number;
  loansOwedCents: number;
  investmentsCents: number;
  netWorthCents: number;
  bySource: Record<string, number>;
  oldestBalanceUpdate: Date | null;
};

export function summarizeBalances(accts: { type: AccountType; currentBalanceCents: number; includeInNetWorth: boolean; source: string; balanceUpdatedAt: Date }[]): BalanceSummary {
  const s: BalanceSummary = { cashCents: 0, creditOwedCents: 0, loansOwedCents: 0, investmentsCents: 0, netWorthCents: 0, bySource: {}, oldestBalanceUpdate: null };
  for (const a of accts) {
    if (a.type === "depository" || a.type === "cash") s.cashCents += a.currentBalanceCents;
    if (a.type === "credit") s.creditOwedCents += a.currentBalanceCents;
    if (a.type === "loan") s.loansOwedCents += a.currentBalanceCents;
    if (a.type === "investment") s.investmentsCents += a.currentBalanceCents;
    if (a.includeInNetWorth) {
      s.netWorthCents += signedBalance(a);
      s.bySource[a.source] = (s.bySource[a.source] ?? 0) + signedBalance(a);
    }
    if (!s.oldestBalanceUpdate || a.balanceUpdatedAt < s.oldestBalanceUpdate) s.oldestBalanceUpdate = a.balanceUpdatedAt;
  }
  return s;
}
