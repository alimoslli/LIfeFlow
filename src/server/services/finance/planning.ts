import { series } from "@/server/db/series";
import { and, asc, eq, max, ne } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, addDaysStr, daysBetween, monthEnd, monthStart } from "@/lib/dates";
import { budgets, categories, financialAccounts, financialGoals, integrations, recurringItems } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { assertOwned, notFound } from "../errors";
import { listCategories } from "./categories";
import { rollupToParents } from "./cashflow";
import {
  PAID_EARLY_DAYS,
  SLACK_DAYS,
  amountsClose,
  billVaries,
  nameRelation,
  paidOccurrences,
  scheduleGap,
  trackedKeys,
  tracksSeries,
  type DueOccurrence,
} from "./bill-match";
import { keywordCategory } from "./categorize";
import { MIN_CONFIDENCE, detectRecurring, merchantKey, merchantKeys, nthOccurrence, occurrencesBetween, type RecurringCandidate } from "./recurring-detect";
import { countsPending, spendableCents } from "./accounts";
import { queryAllTransactions } from "./transactions";
import { netSpendingByCategory } from "./totals";
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
  const [rows, cats, spentById] = await series(
    () =>
      scope.tx
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, scope.userId), eq(budgets.month, m))),
    () => listCategories(scope),
    () => netSpendingByCategory(scope, m, monthEnd(m)),
  );
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
  const [cats, byCategory] = await series(
    () => listCategories(scope),
    () => netSpendingByCategory(scope, from, to),
  );
  return rollupToParents(byCategory, cats);
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
  const early = Math.max(...Object.values(PAID_EARLY_DAYS));
  const due: { item: (typeof items)[number]; date: string }[] = [];
  for (const r of items) {
    if (!r.nextDueDate) continue;
    // Projected from the stored date, so a bill due on the 31st stays on the 31st (or the month's last day). The due
    // dates just before `from` are matched too, so a charge that paid one of those can't pay a later one.
    for (const date of occurrencesBetween(r.nextDueDate, r.frequency, addDaysStr(from, -early), to)) due.push({ item: r, date });
  }
  const ahead = due.filter((d) => d.date >= from);
  if (!ahead.length) return [];
  const recent = await queryAllTransactions(scope, { from: addDaysStr(from, -early), to });
  // Bank series matched to an item add the names its charges post under and whether its amount moves.
  // They're only needed when some charge could pay a due date, so the detection is skipped otherwise.
  const payable = ahead.filter(({ item, date }) =>
    recent.some(
      (t) =>
        Math.sign(t.amountCents) === Math.sign(item.amountCents) &&
        t.date <= date &&
        daysBetween(t.date, date) <= PAID_EARLY_DAYS[item.frequency] &&
        // A transfer can pay a bill tracked under any name (rent by Zelle), when the amount is close.
        (nameRelation(trackedKeys(item), merchantKeys(t)) || (t.kind === "transfer" && amountsClose(item.amountCents, t.amountCents, true))),
    ),
  );
  let paid = new Set<number>();
  if (payable.length) {
    const matched = bank ?? (await bankSeries(scope, from));
    const seriesOf = new Map(items.map((r) => [r.id, seriesForItem(r, matched.trackedActive)]));
    // The charges reach back one cycle of the longest schedule that could be paid: what the last cycle's charges paid
    // tells a second plan from the same merchant (`paidOccurrences`).
    const back = [
      addDaysStr(from, -early),
      ...payable.map(({ item: r }) => addDaysStr(nthOccurrence(from, r.frequency, -1), -PAID_EARLY_DAYS[r.frequency] - SLACK_DAYS[r.frequency])),
    ].sort()[0];
    const [charges, named, accts] = await series(
      () => queryAllTransactions(scope, { from: back, to }),
      () => scope.tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, scope.userId)),
      () =>
        scope.tx
          .select({
            id: financialAccounts.id,
            type: financialAccounts.type,
            source: financialAccounts.source,
            currentBalanceCents: financialAccounts.currentBalanceCents,
            availableBalanceCents: financialAccounts.availableBalanceCents,
          })
          .from(financialAccounts)
          .where(eq(financialAccounts.userId, scope.userId)),
    );
    // A pending charge in an account whose cash figure already takes it off (the bank's available balance) has paid its
    // bill: counting the bill as still due would take the same money off twice. Elsewhere pending still doesn't pay.
    // Only where the bank did take something off (available below posted): one that leaves pending in its available figure
    // hasn't spent it yet.
    const settled = new Set(accts.filter((a) => countsPending(a) && spendableCents(a) < a.currentBalanceCents).map((a) => a.id));
    // A bill with no series yet varies by its category: the one picked, else the one its name reads as ("Verizon": Phone).
    const categoryOf = new Map(named.map((c) => [c.id, c.name]));
    // The found series each charge is a cycle of: a charge of another series is that bill's, never this one's.
    const cycles = Map.groupBy(
      matched.all.flatMap((c) => c.charges.map((x) => ({ at: `${x.date}|${x.amountCents}`, key: c.merchantKey, series: c.seriesKey }))),
      (x) => x.at,
    );
    const cycleOf = (t: (typeof charges)[number]) => {
      const here = cycles.get(`${t.date}|${t.amountCents}`);
      return here && (here.find((x) => x.key === merchantKey(t))?.series ?? null);
    };
    paid = paidOccurrences(
      due.map(({ item, date }): DueOccurrence => {
        const s = seriesOf.get(item.id) ?? [];
        return {
          keys: [...trackedKeys(item), ...s.map((c) => c.merchantKey)],
          series: s.map((c) => c.seriesKey),
          varies: billVaries(s, (item.categoryId && categoryOf.get(item.categoryId)) || keywordCategory({ description: item.name })),
          frequency: item.frequency,
          date,
          day: Number(item.nextDueDate!.slice(8, 10)),
          amountCents: item.amountCents,
        };
      }),
      charges.map((t) => ({ ...t, pending: t.pending && !(t.accountId && settled.has(t.accountId)), series: cycleOf(t) })),
    );
  }
  return due
    .filter((d, i) => d.date >= from && !paid.has(i))
    .map(({ item, date }): { id: string; name: string; date: string; amountCents: number; kind: string; accountId: string | null } => ({
      id: item.id,
      name: item.name,
      date,
      amountCents: item.amountCents,
      kind: item.kind,
      accountId: item.accountId ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

type TrackedItem = Parameters<typeof tracksSeries>[0];

/**
 * The bank series a tracked item stands for (`tracksSeries`). One merchant can bill several (iCloud and
 * Apple Music both read "APPLE.COM/BILL"): then the item stands for the one closest to its amount only (at one
 * price, the one on its schedule), so tracking one never hides the other.
 */
export function seriesForItem(item: TrackedItem, all: RecurringCandidate[]): RecurringCandidate[] {
  const byMerchant = Map.groupBy(
    all.filter((c) => tracksSeries(item, c)),
    (c) => c.merchantKey,
  );
  const off = (c: RecurringCandidate) => Math.abs(c.latestAmountCents - item.amountCents);
  // Two at one price (two Netflix plans): the one on the item's own schedule.
  const gap = (c: RecurringCandidate) => (item.nextDueDate ? scheduleGap(item.nextDueDate, c.nextExpectedDate, item.frequency) : 0);
  const better = (c: RecurringCandidate, best: RecurringCandidate) => off(c) < off(best) || (off(c) === off(best) && gap(c) < gap(best));
  return [...byMerchant.values()].map((g) => g.reduce((best, c) => (better(c, best) ? c : best)));
}

/**
 * Detection over the last 13 months, split into series the user already tracks and the rest. A tracked
 * item matches by key, or by a name inside the other plus the same amount and schedule (`tracksSeries`),
 * and only when money moves the same way (`seriesForItem`). Paused and cancelled items still keep their
 * series out of the suggestions, but only active ones (`trackedActive`) turn a series into a bill. Only
 * series at `MIN_CONFIDENCE` or more are suggested.
 */
export async function bankSeries(scope: UserScope, today: string) {
  const [txns, existing, synced] = await series(
    () => queryAllTransactions(scope, { from: addDaysStr(today, -400), to: today }),
    () => listRecurring(scope, { includeInactive: true }),
    () =>
      scope.tx
        .select({ at: max(integrations.lastSyncedAt) })
        .from(integrations)
        .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "plaid"))),
  );
  // What the feed is current to: its newest transaction, or the last time the bank synced when that's later
  // (a quiet account still confirms a price change and notices a stopped bill). Never the calendar alone:
  // a bank that stopped syncing doesn't make every bill look stopped.
  const later = (a: string, b: string) => (a > b ? a : b);
  // The sync's UTC date can run a day ahead of the user's local today.
  const syncedOn = synced[0]?.at ? [synced[0].at.toISOString().slice(0, 10), today].sort()[0] : "";
  const asOf = later(
    txns.reduce((m, t) => later(m, t.date), ""),
    syncedOn,
  );
  const all = detectRecurring(txns, asOf ? { today: asOf } : {});
  const ownedBy = (items: typeof existing) => new Set(items.flatMap((e) => seriesForItem(e, all)));
  const [tracked, trackedActive] = [ownedBy(existing), ownedBy(existing.filter((e) => e.status === "active"))];
  return {
    tracked: all.filter((c) => tracked.has(c)),
    untracked: all.filter((c) => !tracked.has(c) && c.confidence >= MIN_CONFIDENCE),
    trackedActive: all.filter((c) => trackedActive.has(c)),
    all,
  };
}
export type BankSeries = Awaited<ReturnType<typeof bankSeries>>;

/** Detection over the last 13 months, minus series the user already tracks. */
export async function suggestRecurring(scope: UserScope, today: string) {
  return (await bankSeries(scope, today)).untracked;
}
