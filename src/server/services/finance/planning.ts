import { series } from "@/server/db/series";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, addDaysStr, monthEnd, monthStart } from "@/lib/dates";
import { budgets, categories, financialAccounts, financialGoals, recurringItems } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { assertOwned, notFound } from "../errors";
import { listCategories } from "./categories";
import { rollupToParents, spendingByCategoryId } from "./cashflow";
import { detectRecurring, merchantKey, nextOccurrence } from "./recurring-detect";
import { queryTransactions } from "./transactions";

// ---------------------------------------------------------------- budgets

export const budgetInputSchema = z.object({
  month: z.string().regex(DATE_RE),
  categoryId: z.string().uuid(),
  limitCents: z.number().int().min(0).max(1_000_000_000),
});

export async function setBudget(scope: UserScope, input: z.input<typeof budgetInputSchema>) {
  const d = budgetInputSchema.parse(input);
  await assertOwned(scope, categories, d.categoryId, "Category");
  const month = monthStart(d.month);
  const [row] = await scope.tx
    .insert(budgets)
    .values({ userId: scope.userId, month, categoryId: d.categoryId, limitCents: d.limitCents })
    .onConflictDoUpdate({ target: [budgets.userId, budgets.month, budgets.categoryId], set: { limitCents: d.limitCents } })
    .returning();
  return row;
}

export async function deleteBudget(scope: UserScope, id: string) {
  await scope.tx.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, scope.userId)));
}

/** Budget vs. actual for a month. Budgets on a parent category include its subcategories. */
export async function budgetStatus(scope: UserScope, month: string) {
  const m = monthStart(month);
  const [rows, cats, txns] = await series(
    () =>
      scope.tx
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, scope.userId), eq(budgets.month, m))),
    () => listCategories(scope),
    () => queryTransactions(scope, { from: m, to: monthEnd(m), kinds: ["expense", "refund", "reimbursement"] }),
  );
  const spentById = spendingByCategoryId(txns);
  const descendants = (id: string): Set<string> => {
    const set = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of cats) {
        if (c.parentId && set.has(c.parentId) && !set.has(c.id)) {
          set.add(c.id);
          grew = true;
        }
      }
    }
    return set;
  };
  return rows
    .map((b) => {
      const cat = cats.find((c) => c.id === b.categoryId)!;
      const ids = descendants(b.categoryId);
      let spent = 0;
      for (const [cid, cents] of spentById) if (cid && ids.has(cid)) spent += cents;
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: cat?.name ?? "Unknown",
        childIds: [...ids],
        color: cat?.color ?? null,
        limitCents: b.limitCents,
        spentCents: spent,
        remainingCents: b.limitCents - spent,
        percent: b.limitCents ? Math.round((spent / b.limitCents) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export async function spendingByCategory(scope: UserScope, from: string, to: string) {
  const [cats, txns] = await series(
    () => listCategories(scope),
    () => queryTransactions(scope, { from, to, kinds: ["expense", "refund", "reimbursement"] }),
  );
  return rollupToParents(spendingByCategoryId(txns), cats);
}

// ---------------------------------------------------------------- goals

export const goalInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetCents: z.number().int().positive(),
  savedCents: z.number().int().min(0).default(0),
  targetDate: z.string().regex(DATE_RE).nullish(),
  accountId: z.string().uuid().nullish(),
  kind: z.enum(["savings", "debt", "investment"]).default("savings"),
  purpose: z.enum(["emergency", "travel", "car", "home", "debt", "investing", "education", "big_purchase", "other"]).default("other"),
  monthlyPlanCents: z.number().int().min(0).max(100_000_000).nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function createGoal(scope: UserScope, input: z.input<typeof goalInputSchema>) {
  const d = goalInputSchema.parse(input);
  await assertOwned(scope, financialAccounts, d.accountId, "Account");
  const [row] = await scope.tx
    .insert(financialGoals)
    .values({ ...d, userId: scope.userId })
    .returning();
  return row;
}

export async function updateGoal(
  scope: UserScope,
  id: string,
  patch: Partial<z.input<typeof goalInputSchema>> & { status?: "active" | "achieved" | "archived" },
) {
  const { status, ...rest } = patch;
  const d = goalInputSchema.partial().parse(rest);
  const [row] = await scope.tx
    .update(financialGoals)
    .set({ ...d, ...(status && { status }) })
    .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Goal");
  return row;
}

export async function listGoals(scope: UserScope) {
  const rows = await scope.tx
    .select({ goal: financialGoals, accountBalance: financialAccounts.currentBalanceCents })
    .from(financialGoals)
    .leftJoin(financialAccounts, eq(financialAccounts.id, financialGoals.accountId))
    .where(and(eq(financialGoals.userId, scope.userId), ne(financialGoals.status, "archived")))
    .orderBy(asc(financialGoals.targetDate));
  return rows.map(({ goal, accountBalance }) => {
    // A goal linked to an account tracks that account's balance.
    const saved = accountBalance ?? goal.savedCents;
    return { ...goal, savedCents: saved, percent: Math.min(100, Math.round((saved / goal.targetCents) * 100)) };
  });
}

/** Monthly amount needed to reach a goal by its target date. */
export function monthlyContributionNeeded(targetCents: number, savedCents: number, targetDate: string | null, today: string) {
  if (!targetDate) return null;
  const months = Math.max(1, (Number(targetDate.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(targetDate.slice(5, 7)) - Number(today.slice(5, 7)));
  return Math.max(0, Math.ceil((targetCents - savedCents) / months));
}

// ---------------------------------------------------------------- recurring

export const recurringInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  nextDueDate: z.string().regex(DATE_RE).nullish(),
  kind: z.enum(["bill", "subscription", "income", "other"]),
  categoryId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
});

export async function createRecurring(scope: UserScope, input: z.input<typeof recurringInputSchema>, source: "manual" | "detected" | "demo" = "manual") {
  const d = recurringInputSchema.parse(input);
  await assertOwned(scope, categories, d.categoryId, "Category");
  await assertOwned(scope, financialAccounts, d.accountId, "Account");
  const [row] = await scope.tx
    .insert(recurringItems)
    .values({ ...d, userId: scope.userId, source, merchantKey: merchantKey({ merchantName: d.name, description: d.name }) })
    .returning();
  return row;
}

export async function setRecurringStatus(scope: UserScope, id: string, status: "active" | "paused" | "cancelled") {
  const [row] = await scope.tx
    .update(recurringItems)
    .set({ status })
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Recurring item");
  return row;
}

export async function listRecurring(scope: UserScope, opts: { includeInactive?: boolean } = {}) {
  const rows = await scope.tx.select().from(recurringItems).where(eq(recurringItems.userId, scope.userId)).orderBy(asc(recurringItems.nextDueDate));
  return opts.includeInactive ? rows : rows.filter((r) => r.status === "active");
}

/** Upcoming bills/income between two dates, projecting each active series forward. */
export async function upcomingRecurring(scope: UserScope, from: string, to: string) {
  const items = await listRecurring(scope);
  const out: { id: string; name: string; date: string; amountCents: number; kind: string }[] = [];
  for (const r of items) {
    if (!r.nextDueDate) continue;
    let d = r.nextDueDate;
    for (let guard = 0; d < from && guard < 200; guard++) d = nextOccurrence(d, r.frequency);
    for (let guard = 0; d <= to && guard < 60; guard++, d = nextOccurrence(d, r.frequency)) {
      out.push({ id: r.id, name: r.name, date: d, amountCents: r.amountCents, kind: r.kind });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Detection over the last 13 months, minus series the user already tracks. */
export async function suggestRecurring(scope: UserScope, today: string) {
  const [txns, existing] = await series(
    () => queryTransactions(scope, { from: addDaysStr(today, -400), to: today, limit: 5000 }),
    () => listRecurring(scope, { includeInactive: true }),
  );
  const known = new Set(existing.map((e) => e.merchantKey));
  return detectRecurring(txns).filter((c) => !known.has(c.merchantKey));
}
