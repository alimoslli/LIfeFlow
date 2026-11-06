import { series } from "@/server/db/series";
import { ServiceError } from "../../services/errors";
import { z } from "zod";
import { monthStart } from "@/lib/dates";
import { ACCOUNT_TYPES, createManualAccount, listAccounts, summarizeBalances } from "../../services/finance/accounts";
import { moneyOverview } from "../../services/finance/overview";
import { listCategories, resolveCategory } from "../../services/finance/categories";
import { categoryIdByName, keywordCategory } from "../../services/finance/categorize";
import type { UserScope } from "../../db/with-user";
import { affordability, compareSpending, spendingSummary } from "../../services/finance/insights";
import {
  budgetStatus,
  createRecurring,
  deleteRecurring,
  getRecurring,
  listRecurring,
  setBudget,
  suggestRecurring,
  upcomingRecurring,
  updateRecurring,
} from "../../services/finance/planning";
import { TRANSACTION_KINDS, createTransaction, findTransactions, queryTransactions } from "../../services/finance/transactions";
import { scanTransactions } from "../../services/finance/findings";
import { addDaysStr } from "@/lib/dates";
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

/** Tells the model the real names so it can retry with one instead of guessing again. */
async function unknownCategory(s: UserScope, name: string) {
  const names = (await listCategories(s)).map((c) => c.name);
  return `No category called "${name}". Pick one of: ${names.join(", ")}. If none fits, leave category out and ask the user.`;
}

const range = { from: dateArg("Start date (inclusive)"), to: dateArg("End date (inclusive)") };

const FREQ = z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]);
const presentRecurring = (r: { id: string; name: string; amountCents: number; frequency: string; nextDueDate: string | null; kind: string }) =>
  centsToDollarsDeep({ id: r.id, name: r.name, amountCents: r.amountCents, frequency: r.frequency, nextDueDate: r.nextDueDate, kind: r.kind });

export const financeTools = [
  defineTool({
    name: "add_bill",
    description:
      "Track a recurring bill, subscription or income (rent, phone, Netflix, paycheck). amount is positive; income: true for money coming in. Check recurring_payments first to avoid duplicates.",
    schema: z.object({
      name: z.string().min(1).max(120),
      amount: moneyArg("Amount each time"),
      frequency: FREQ,
      nextDueDate: dateArg("Next due date").optional(),
      kind: z.enum(["bill", "subscription", "income", "other"]).optional(),
      category: z.string().max(80).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const cat = a.category ? await resolveCategory(s, a.category) : null;
        if (a.category && !cat) throw new ServiceError(await unknownCategory(s, a.category));
        // No category given: the same merchant words that sort bank lines ("Netflix" → Streaming).
        const guess = !a.category ? keywordCategory({ description: a.name }, a.kind === "income" ? 1 : -1) : null;
        const guessed = guess ? await categoryIdByName(s, guess) : null;
        const income = a.kind === "income";
        const r = await createRecurring(s, {
          name: a.name,
          amountCents: (income ? 1 : -1) * Math.abs(toCents(a.amount)),
          frequency: a.frequency,
          nextDueDate: a.nextDueDate ?? null,
          kind: a.kind ?? "bill",
          categoryId: cat?.category.id ?? guessed?.id ?? null,
        });
        return { created: presentRecurring(r), viewAt: "/finances/bills" };
      });
    },
  }),
  defineTool({
    name: "update_bill",
    description:
      "Change a tracked bill/subscription/income: name, amount, how often, next due date. Only pass fields that change. Ids from recurring_payments.",
    schema: z.object({
      id: idArg("Bill"),
      name: z.string().min(1).max(120).optional(),
      amount: moneyArg("Amount each time").optional(),
      frequency: FREQ.optional(),
      nextDueDate: dateArg("Next due date").optional(),
    }),
    mutates: true,
    async execute({ id, amount, ...patch }, ctx) {
      return ctx.run(async (s) => {
        const before = await getRecurring(s, id);
        const sign = before.amountCents < 0 ? -1 : 1;
        const r = await updateRecurring(s, id, { ...patch, ...(amount !== undefined && { amountCents: sign * Math.abs(toCents(amount)) }) });
        return { updated: presentRecurring(r), viewAt: "/finances/bills" };
      });
    },
  }),
  defineTool({
    name: "delete_bill",
    description: "Stop tracking a recurring bill, subscription or income. Past transactions stay. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Bill") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const r = await ctx.run((s) => getRecurring(s, id));
      return `Stop tracking ${r.name} ($${(Math.abs(r.amountCents) / 100).toFixed(2)} ${r.frequency})? Past transactions stay.`;
    },
    async execute({ id }, ctx) {
      return ctx.run(async (s) => {
        const r = await getRecurring(s, id);
        await deleteRecurring(s, id);
        return { stoppedTracking: r.name };
      });
    },
  }),
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
      "Income, spending, refunds, transfers and top categories/merchants for a date range, optionally filtered by category (includes subcategories, e.g. 'Food & Dining') or a merchant/description search. Use for 'how much did I spend on X' and 'how much did I earn'. With a name in search, totals count only rows that match the full name; unconfirmed {count, amount} is extra money in lines that matched only a shortened name or an initial: always mention it (\"plus $85 that may be him\") and never add it into the total.",
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
    description:
      "Look up individual transactions. Amounts in dollars: negative = money out. Also use it for 'when did I last pay, Zelle, Venmo or Cash App someone' (search the person's name, plus the app if they said one, e.g. search \"Zelle Omar Mousselli\"; newest first. Rows run both ways: for 'paid/sent/Zelled' the last time is the newest row with a negative amount, for 'received' the newest positive one; never assume the first row). search is forgiving: every word must appear somewhere in the bank line, merchant or notes, in any order, truncated names and payment-app words are fine, and you do not need to add 'Zelle' or 'to'. If nothing matches, the result has matchType 'none' and closestPayments (recent person-to-person payments): say plainly what you didn't find, and if closestPayments has rows ask whether one is who they meant. matchType 'similar' means the spelling differs: confirm with the user. A row with sure:false matched only through a shortened name, a bare initial or a typo: never state it as fact, ask the user to confirm it is who they meant.",
    schema: z.object({
      from: dateArg().optional(),
      to: dateArg().optional(),
      category: z.string().max(80).optional(),
      search: z.string().max(100).optional().describe("Person, merchant or description words, e.g. 'Omar Mousselli' or 'Starbucks'"),
      kinds: z.array(z.enum(TRANSACTION_KINDS)).optional(),
      minAmount: z.number().min(0).optional().describe("Minimum absolute amount in dollars"),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      const found = await ctx.run((s) =>
        findTransactions(s, {
          from: a.from,
          to: a.to,
          categoryName: a.category,
          search: a.search,
          kinds: a.kinds,
          minAmountCents: a.minAmount != null ? toCents(a.minAmount) : undefined,
          limit: a.limit ?? 40,
        }),
      );
      const shape = (t: (typeof found.rows)[number]) => ({
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
        sure: t.sure,
      });
      return centsToDollarsDeep({
        count: found.rows.length,
        matchType: found.match,
        ...(found.match === "exact" && !found.rows.length && { note: "No transactions match those filters. Say so plainly, naming what you looked for." }),
        ...(found.match === "exact" &&
          found.rows.some((r) => !r.sure) && {
            note: "Rows with sure:false matched only through a shortened name, a bare initial or a typo. Do not state them as fact: confirm with the user that it is who they meant.",
          }),
        ...(found.match === "similar" && { note: "No exact match for that spelling. These look similar: confirm with the user that it is who they meant." }),
        ...(found.match === "none" &&
          a.search && {
            note: `Nothing matches "${a.search}". Say so plainly, naming what you looked for. If closestPayments has rows, ask whether one of them is who they meant; never invent a match.`,
            closestPayments: found.closest.map(shape),
          }),
        transactions: found.rows.map(shape),
      });
    },
  }),
  defineTool({
    name: "add_account",
    description:
      "Add an account the user tracks by hand (checking, savings, cash, a card, a loan, investments). Balance in dollars as the user sees it; cards and loans are owed amounts as positive numbers.",
    schema: z.object({
      name: z.string().min(1).max(120),
      type: z.enum(ACCOUNT_TYPES),
      subtype: z.string().max(60).optional().describe("e.g. checking, savings"),
      balance: moneyArg("Current balance"),
    }),
    mutates: true,
    async execute(a, ctx) {
      const acc = await ctx.run((s) =>
        createManualAccount(s, { name: a.name, type: a.type, subtype: a.subtype ?? null, currentBalanceCents: toCents(a.balance) }),
      );
      return { created: { id: acc.id, name: acc.name, type: acc.type, balance: toDollars(acc.currentBalanceCents) }, viewAt: "/finances/accounts" };
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
        if (a.category && !cat) throw new ServiceError(await unknownCategory(s, a.category));
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
        if (!cat) throw new ServiceError(await unknownCategory(s, a.category));
        const b = await setBudget(s, { month: a.month ?? ctx.today, categoryId: cat.category.id, limitCents: toCents(a.monthlyLimit) });
        return centsToDollarsDeep({
          saved: { category: cat.category.name, month: b.month.slice(0, 7), limitCents: b.limitCents },
          viewAt: "/finances/budgets",
        });
      });
    },
  }),
  defineTool({
    name: "money_findings",
    description:
      "Scans their real bank feed for things they'd want to know: possible double charges, bank fees (overdraft, ATM, late), recurring charges and subscriptions found but not tracked, and charges that went up. Use it on your own whenever money comes up, and say what you found.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return ctx.run(async (s) => {
        const [txns, recurring] = await series(
          () => queryTransactions(s, { from: addDaysStr(ctx.today, -400), to: ctx.today, limit: 20_000 }),
          () => suggestRecurring(s, ctx.today),
        );
        const scan = scanTransactions(txns, ctx.today);
        return centsToDollarsDeep({
          period: `last 30 days to ${ctx.today}`,
          possibleDoubleCharges: scan.doubleCharges,
          bankFees: scan.fees,
          bankFeesTotalCents: scan.feesTotalCents,
          recurringNotTracked: recurring
            .filter((r) => r.latestAmountCents < 0)
            .map((r) => ({
              name: r.name,
              kind: r.kind,
              frequency: r.frequency,
              latestAmountCents: r.latestAmountCents,
              nextExpectedDate: r.nextExpectedDate,
              ...(r.variableAmount ? { amountVaries: true } : {}),
              // The latest change of price, from the first charge at the new one.
              ...(r.priceChange ? { priceChange: { fromCents: r.priceChange.fromCents, toCents: r.priceChange.toCents, since: r.priceChange.date } } : {}),
            })),
          viewAt: "/finances/transactions",
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
        const to = addDaysStr(ctx.today, 30);
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
          // Found in their transactions but not tracked yet: say these out loud and offer to track them.
          detectedNotTracked: detected.map((d) => ({
            name: d.name,
            kind: d.kind,
            frequency: d.frequency,
            latestAmountCents: d.latestAmountCents,
            ...(d.variableAmount ? { amountVaries: true, averageAmountCents: d.averageAmountCents } : {}),
            lastDate: d.lastDate,
            nextExpectedDate: d.nextExpectedDate,
            charges: d.occurrences,
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
