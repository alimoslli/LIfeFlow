import { series } from "@/server/db/series";
import { z } from "zod";
import { monthStart } from "@/lib/dates";
import { listAccounts, summarizeBalances } from "../../services/finance/accounts";
import { moneyOverview } from "../../services/finance/overview";
import { listCategories, resolveCategory } from "../../services/finance/categories";
import { affordability, compareSpending, spendingSummary } from "../../services/finance/insights";
import {
  budgetStatus,
  createGoal,
  listGoals,
  listRecurring,
  monthlyContributionNeeded,
  setBudget,
  suggestRecurring,
  updateGoal,
  upcomingRecurring,
} from "../../services/finance/planning";
import { TRANSACTION_KINDS, createTransaction, queryTransactions } from "../../services/finance/transactions";
import { holdings } from "../../db/schema";
import { eq } from "drizzle-orm";
import { dateArg, defineTool, idArg, moneyArg, toCents, toDollars } from "../tool";

/** Converts every *Cents field in a result to dollars for the model. */
export function centsToDollarsDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(centsToDollarsDeep);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.endsWith("Cents") && typeof val === "number") out[k.replace(/Cents$/, "")] = toDollars(val);
      else if (k === "cents" && typeof val === "number") out.amount = toDollars(val);
      else out[k] = centsToDollarsDeep(val);
    }
    return out;
  }
  return v;
}

const range = { from: dateArg("Start date (inclusive)"), to: dateArg("End date (inclusive)") };

export const financeTools = [
  defineTool({
    name: "money_overview",
    description:
      "The user's headline money numbers, from the same source every page uses: cash & checking, savings, card and loan balances, investments, net worth, this month's spending and income (with the exact date range), and budget totals. " +
      "Use this first for any 'where do I stand' question, and quote the range and 'as of' time. Never estimate a number this returns.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const o = await ctx.run((s) => moneyOverview(s, ctx.today));
      if (!o.hasAccounts) return { hasAccounts: false, note: "No accounts yet. The user can add one on Money, Accounts, or connect a bank." };
      const { investmentAccounts: _i, ...balances } = o.balances;
      return centsToDollarsDeep({
        balances,
        thisMonth: {
          range: o.month.period.label,
          from: o.month.period.from,
          to: o.month.period.to,
          spentCents: o.month.netSpendingCents,
          incomeCents: o.month.incomeCents,
          netCents: o.month.netCashflowCents,
          pendingCount: o.month.pendingCount,
        },
        budgets: {
          limitCents: o.budgets.limitCents,
          spentInBudgetsCents: o.budgets.budgetedSpentCents,
          spentWithoutBudgetCents: o.budgets.unbudgetedSpentCents,
          count: o.budgets.count,
        },
        investments: o.investments,
        viewAt: "/money",
      });
    },
  }),
  defineTool({
    name: "list_accounts",
    description:
      "Financial accounts with balances, source (manual/demo/plaid…) and when each balance was last updated, plus net-worth totals. Amounts in dollars; credit/loan balances are amounts owed.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const accts = await ctx.run((s) => listAccounts(s));
      return centsToDollarsDeep({
        accounts: accts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          institution: a.institutionName,
          mask: a.mask,
          currentBalanceCents: a.currentBalanceCents,
          source: a.source,
          balanceAsOf: a.balanceUpdatedAt,
        })),
        totals: summarizeBalances(accts),
      });
    },
  }),
  defineTool({
    name: "spending_summary",
    description:
      "Income, spending, refunds, transfers and top categories/merchants for a date range, optionally filtered by category (includes subcategories, e.g. 'Food & Dining') or a merchant/description search. Use for 'how much did I spend on X' and 'how much did I earn'.",
    schema: z.object({
      ...range,
      category: z.string().max(80).optional().describe("Category name; call list_categories if unsure"),
      search: z.string().max(100).optional().describe("Merchant or description text"),
      accountId: idArg("Account").optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep(
        await ctx.run((s) => spendingSummary(s, { from: a.from, to: a.to, categoryName: a.category, search: a.search, accountId: a.accountId })),
      );
    },
  }),
  defineTool({
    name: "compare_spending",
    description: "Compare spending in a period with the equally long period right before it, by category. Use for 'why am I spending more than usual'.",
    schema: z.object(range),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep(await ctx.run((s) => compareSpending(s, a.from, a.to)));
    },
  }),
  defineTool({
    name: "query_transactions",
    description: "Look up individual transactions. Amounts in dollars: negative = money out.",
    schema: z.object({
      from: dateArg().optional(),
      to: dateArg().optional(),
      category: z.string().max(80).optional(),
      search: z.string().max(100).optional(),
      kinds: z.array(z.enum(TRANSACTION_KINDS)).optional(),
      minAmount: z.number().min(0).optional().describe("Minimum absolute amount in dollars"),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      const rows = await ctx.run((s) =>
        queryTransactions(s, {
          from: a.from,
          to: a.to,
          categoryName: a.category,
          search: a.search,
          kinds: a.kinds,
          minAmountCents: a.minAmount != null ? toCents(a.minAmount) : undefined,
          limit: a.limit ?? 40,
        }),
      );
      return centsToDollarsDeep({
        count: rows.length,
        transactions: rows.map((t) => ({
          id: t.id,
          date: t.date,
          description: t.description,
          merchant: t.merchantName,
          amountCents: t.amountCents,
          kind: t.kind,
          category: t.categoryName,
          account: t.accountName,
          pending: t.pending,
          source: t.source,
        })),
      });
    },
  }),
  defineTool({
    name: "add_transaction",
    description: "Record a manual transaction. amount: negative for money out, positive for money in.",
    schema: z.object({
      accountId: idArg("Account"),
      date: dateArg(),
      description: z.string().min(1).max(300),
      amount: moneyArg("Signed amount"),
      category: z.string().max(80).optional(),
      kind: z.enum(TRANSACTION_KINDS).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const cat = a.category ? await resolveCategory(s, a.category) : null;
        if (a.category && !cat) throw new Error(`No category named "${a.category}".`);
        const row = await createTransaction(
          s,
          { accountId: a.accountId, date: a.date, description: a.description, amountCents: toCents(a.amount), categoryId: cat?.category.id, kind: a.kind },
          "jarvis",
        );
        return {
          created: centsToDollarsDeep({ id: row!.id, date: row!.date, amountCents: row!.amountCents, kind: row!.kind }),
          viewAt: "/finances/transactions",
        };
      });
    },
  }),
  defineTool({
    name: "list_categories",
    description: "Spending/income categories (with parent groups).",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const cats = await ctx.run((s) => listCategories(s));
      const name = new Map(cats.map((c) => [c.id, c.name]));
      return { categories: cats.map((c) => ({ name: c.name, kind: c.kind, parent: c.parentId ? name.get(c.parentId) : undefined })) };
    },
  }),
  defineTool({
    name: "budget_status",
    description: "Budget limits vs. actual net spending for a month.",
    schema: z.object({ month: dateArg("Any date in the month").optional() }),
    mutates: false,
    async execute(a, ctx) {
      const m = monthStart(a.month ?? ctx.today);
      return centsToDollarsDeep({ month: m.slice(0, 7), budgets: await ctx.run((s) => budgetStatus(s, m)) });
    },
  }),
  defineTool({
    name: "set_budget",
    description: "Create or change a monthly category budget.",
    schema: z.object({
      category: z.string().min(1).max(80),
      monthlyLimit: moneyArg("Limit"),
      month: dateArg("Any date in the month (default: this month)").optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const cat = await resolveCategory(s, a.category);
        if (!cat) throw new Error(`No category named "${a.category}". Use list_categories.`);
        const b = await setBudget(s, { month: a.month ?? ctx.today, categoryId: cat.category.id, limitCents: toCents(a.monthlyLimit) });
        return centsToDollarsDeep({
          saved: { category: cat.category.name, month: b.month.slice(0, 7), limitCents: b.limitCents },
          viewAt: "/finances/budgets",
        });
      });
    },
  }),
  defineTool({
    name: "recurring_payments",
    description:
      "Tracked bills, subscriptions and recurring income, upcoming occurrences in the next 30 days, and newly detected recurring patterns not yet tracked.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return ctx.run(async (s) => {
        const to = new Date(ctx.now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
        const [tracked, upcoming, detected] = await series(
          () => listRecurring(s),
          () => upcomingRecurring(s, ctx.today, to),
          () => suggestRecurring(s, ctx.today),
        );
        return centsToDollarsDeep({
          tracked: tracked.map((r) => ({
            id: r.id,
            name: r.name,
            amountCents: r.amountCents,
            frequency: r.frequency,
            nextDueDate: r.nextDueDate,
            kind: r.kind,
          })),
          upcoming30Days: upcoming,
          detectedNotTracked: detected.map((d) => ({
            name: d.name,
            frequency: d.frequency,
            averageAmountCents: d.averageAmountCents,
            lastDate: d.lastDate,
            confidence: d.confidence,
          })),
        });
      });
    },
  }),
  defineTool({
    name: "check_affordability",
    description:
      "Facts for 'can I afford $X (by date)?': cash on hand, upcoming bills, typical daily spending and a projection. Future income is never counted. Explain the assumptions in your answer.",
    schema: z.object({ amount: moneyArg("Purchase amount"), byDate: dateArg("Date the money is needed by").optional() }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep(await ctx.run((s) => affordability(s, toCents(a.amount), ctx.today, a.byDate)));
    },
  }),
  defineTool({
    name: "financial_goals",
    description: "List savings/debt goals with progress, or create one / update saved amount.",
    schema: z.object({
      create: z
        .object({ name: z.string().min(1).max(120), target: moneyArg("Target"), targetDate: dateArg().optional(), saved: moneyArg("Already saved").optional() })
        .optional(),
      update: z
        .object({ id: idArg("Goal"), saved: moneyArg("New saved total").optional(), status: z.enum(["active", "achieved", "archived"]).optional() })
        .optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        if (a.create)
          await createGoal(s, {
            name: a.create.name,
            targetCents: toCents(a.create.target),
            targetDate: a.create.targetDate,
            savedCents: a.create.saved ? toCents(a.create.saved) : 0,
          });
        if (a.update) await updateGoal(s, a.update.id, { ...(a.update.saved != null && { savedCents: toCents(a.update.saved) }), status: a.update.status });
        const goals = await listGoals(s);
        return centsToDollarsDeep({
          goals: goals.map((g) => ({
            id: g.id,
            name: g.name,
            targetCents: g.targetCents,
            savedCents: g.savedCents,
            percent: g.percent,
            targetDate: g.targetDate,
            monthlyNeededCents: monthlyContributionNeeded(g.targetCents, g.savedCents, g.targetDate, ctx.today),
          })),
          viewAt: "/finances/goals",
        });
      });
    },
  }),
  defineTool({
    name: "investment_holdings",
    description:
      "Investment accounts and any holdings on record (manual or synced). Holdings exist only if the user entered them or an investments-enabled integration synced them.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return ctx.run(async (s) => {
        const accts = await listAccounts(s, { types: ["investment"] });
        const h = await s.tx.select().from(holdings).where(eq(holdings.userId, s.userId));
        return centsToDollarsDeep({
          accounts: accts.map((a) => ({
            id: a.id,
            name: a.name,
            subtype: a.subtype,
            balanceCents: a.currentBalanceCents,
            source: a.source,
            asOf: a.balanceUpdatedAt,
          })),
          holdings: h.map((x) => ({
            accountId: x.accountId,
            symbol: x.symbol,
            name: x.name,
            quantity: Number(x.quantity),
            valueCents: x.valueCents,
            source: x.source,
            asOf: x.asOf,
          })),
          note: h.length ? undefined : "No holdings on record. Balances only.",
        });
      });
    },
  }),
];
