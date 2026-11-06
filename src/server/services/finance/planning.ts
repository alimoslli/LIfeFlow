import { series } from "@/server/db/series";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, addDaysStr, daysBetween, monthEnd, monthStart } from "@/lib/dates";
import { budgets, categories, financialAccounts, financialGoals, recurringItems } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { assertOwned, notFound } from "../errors";
import { listCategories } from "./categories";
import { rollupToParents, spendingByCategoryId } from "./cashflow";
import { PAID_EARLY_DAYS, amountsClose, nameRelation, paidOccurrences, trackedKeys, tracksSeries, type DueOccurrence } from "./bill-match";
import { MIN_CONFIDENCE, detectRecurring, merchantKey, merchantKeys, occurrencesBetween, type RecurringCandidate } from "./recurring-detect";
import { queryTransactions } from "./transactions";
import { parsePatch } from "../patch";

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
  const d = parsePatch(goalInputSchema.partial(), rest);
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
  // Real time left (Nov 2 to Dec 31 is about 2 months, not the 1 that calendar months give), never under a month.
  const months = Math.max(1, daysBetween(today, targetDate) / 30.44);
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

export async function updateRecurring(scope: UserScope, id: string, patch: Partial<z.input<typeof recurringInputSchema>>) {
  const d = parsePatch(recurringInputSchema.partial(), patch);
  await assertOwned(scope, categories, d.categoryId, "Category");
  await assertOwned(scope, financialAccounts, d.accountId, "Account");
  const [row] = await scope.tx
    .update(recurringItems)
    .set(d)
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Recurring item");
  return row;
}

export async function getRecurring(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(recurringItems)
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, scope.userId)));
  if (!row) throw notFound("Recurring item");
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

export async function deleteRecurring(scope: UserScope, id: string) {
  await scope.tx.delete(recurringItems).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, scope.userId)));
}

export async function listRecurring(scope: UserScope, opts: { includeInactive?: boolean } = {}) {
  const rows = await scope.tx.select().from(recurringItems).where(eq(recurringItems.userId, scope.userId)).orderBy(asc(recurringItems.nextDueDate));
  return opts.includeInactive ? rows : rows.filter((r) => r.status === "active");
}

/**
 * Upcoming bills/income between two dates, projecting each active series forward. A due date that a
 * posted charge already paid (on the day or a few days before, `paidOccurrences`) is left out, so the
 * next one is the following cycle. Worked out when read; stored due dates aren't rewritten. Pass `bank`
 * when the caller already has it, so the detection runs once.
 */
export async function upcomingRecurring(scope: UserScope, from: string, to: string, bank?: BankSeries) {
  const items = await listRecurring(scope);
  const due: { item: (typeof items)[number]; date: string }[] = [];
  for (const r of items) {
    if (!r.nextDueDate) continue;
    // Projected from the stored date, so a bill due on the 31st stays on the 31st (or the month's last day).
    for (const date of occurrencesBetween(r.nextDueDate, r.frequency, from, to)) due.push({ item: r, date });
  }
  if (!due.length) return [];
  const charges = await queryTransactions(scope, { from: addDaysStr(from, -Math.max(...Object.values(PAID_EARLY_DAYS))), to, limit: 5000 });
  // Bank series matched to an item add the names its charges post under and whether its amount moves.
  // They're only needed when some charge could pay a due date, so the detection is skipped otherwise.
  const couldPay = charges.some((t) =>
    due.some(
      ({ item, date }) =>
        Math.sign(t.amountCents) === Math.sign(item.amountCents) &&
        t.date <= date &&
        daysBetween(t.date, date) <= PAID_EARLY_DAYS[item.frequency] &&
        // A transfer can pay a bill tracked under any name (rent by Zelle), when the amount is close.
        (nameRelation(trackedKeys(item), merchantKeys(t)) || (t.kind === "transfer" && amountsClose(item.amountCents, t.amountCents, true))),
    ),
  );
  const matched = bank ?? (couldPay ? await bankSeries(scope, from) : null);
  const seriesOf = new Map(items.map((r) => [r.id, matched ? seriesForItem(r, matched.trackedActive) : []]));
  const paid = paidOccurrences(
    due.map(({ item, date }): DueOccurrence => {
      const s = seriesOf.get(item.id) ?? [];
      return {
        keys: [...trackedKeys(item), ...s.map((c) => c.merchantKey)],
        varies: s.some((c) => c.variableAmount),
        frequency: item.frequency,
        date,
        amountCents: item.amountCents,
      };
    }),
    charges,
  );
  return due
    .filter((_, i) => !paid.has(i))
    .map(({ item, date }): { id: string; name: string; date: string; amountCents: number; kind: string } => ({
      id: item.id,
      name: item.name,
      date,
      amountCents: item.amountCents,
      kind: item.kind,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

type TrackedItem = Parameters<typeof tracksSeries>[0];

/**
 * The bank series a tracked item stands for (`tracksSeries`). One merchant can bill several (iCloud and
 * Apple Music both read "APPLE.COM/BILL"): then the item stands for the one closest to its amount only,
 * so tracking one never hides the other.
 */
export function seriesForItem(item: TrackedItem, all: RecurringCandidate[]): RecurringCandidate[] {
  const byMerchant = Map.groupBy(
    all.filter((c) => tracksSeries(item, c)),
    (c) => c.merchantKey,
  );
  const off = (c: RecurringCandidate) => Math.abs(c.latestAmountCents - item.amountCents);
  return [...byMerchant.values()].map((g) => g.reduce((best, c) => (off(c) < off(best) ? c : best)));
}

/**
 * Detection over the last 13 months, split into series the user already tracks and the rest. A tracked
 * item matches by key, or by a name inside the other plus the same amount and schedule (`tracksSeries`),
 * and only when money moves the same way (`seriesForItem`). Paused and cancelled items still keep their
 * series out of the suggestions, but only active ones (`trackedActive`) turn a series into a bill. Only
 * series at `MIN_CONFIDENCE` or more are suggested.
 */
export async function bankSeries(scope: UserScope, today: string) {
  const [txns, existing] = await series(
    () => queryTransactions(scope, { from: addDaysStr(today, -400), to: today, limit: 5000 }),
    () => listRecurring(scope, { includeInactive: true }),
  );
  const all = detectRecurring(txns);
  const ownedBy = (items: typeof existing) => new Set(items.flatMap((e) => seriesForItem(e, all)));
  const [tracked, trackedActive] = [ownedBy(existing), ownedBy(existing.filter((e) => e.status === "active"))];
  return {
    tracked: all.filter((c) => tracked.has(c)),
    untracked: all.filter((c) => !tracked.has(c) && c.confidence >= MIN_CONFIDENCE),
    trackedActive: all.filter((c) => trackedActive.has(c)),
  };
}
export type BankSeries = Awaited<ReturnType<typeof bankSeries>>;

/** Detection over the last 13 months, minus series the user already tracks. */
export async function suggestRecurring(scope: UserScope, today: string) {
  return (await bankSeries(scope, today)).untracked;
}
