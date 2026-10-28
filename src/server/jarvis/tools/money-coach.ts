import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { financialAccounts, financialGoals, transactions } from "../../db/schema";
import { resolveCategory } from "../../services/finance/categories";
import { applyRuleToPast } from "../../services/finance/categorize";
import { debtReport, emergencyFundPlan, financialHealth, planPaycheck, roundUps, subscriptionReport } from "../../services/finance/coach";
import { dailyCheckin, monthlyReport, weeklyCheckin } from "../../services/finance/checkins";
import { budgetWarnings, cashForecast, safeToSpend } from "../../services/finance/forecast";
import { contributeToGoal, deleteGoal, goalTradeoff, goalsWithPlans } from "../../services/finance/goals";
import { GENERAL_INFO, investmentReport, LESSONS, projectInvesting } from "../../services/finance/investing";
import { createGoal, updateGoal } from "../../services/finance/planning";
import { applyBudgetPlan, BUDGET_METHODS, suggestBudgets } from "../../services/finance/smart-budgets";
import { deleteTransaction, TRANSACTION_KINDS, updateTransaction } from "../../services/finance/transactions";
import { notFound } from "../../services/errors";
import { listPlaidConnections, PlaidError, syncConnection } from "../../integrations/plaid";
import { centsToDollarsDeep } from "./finance";
import { dateArg, defineTool, idArg, moneyArg, toCents } from "../tool";

/**
 * The personal-finance coach. Every number comes from the user's records via
 * the finance services. Anything that changes an account, deletes money
 * records, or records money set aside waits for the user's Confirm.
 */

const usd = (dollars: number) => `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const PURPOSES = ["emergency", "travel", "car", "home", "debt", "investing", "education", "big_purchase", "other"] as const;

export const moneyCoachTools = [
  defineTool({
    name: "sync_bank_accounts",
    description:
      "Refresh the user's connected banks now (balances, transactions, holdings, card details) and report what changed. Only works for banks connected through Plaid; if none are connected, point them to Money, Accounts, Connect a bank.",
    schema: z.object({}),
    mutates: true,
    async execute(_a, ctx) {
      const items = await ctx.run((s) => listPlaidConnections(s));
      if (!items.length) return { connected: false, note: "No banks connected. The user can connect one on Money, Accounts." };
      const results = [];
      for (const i of items) {
        try {
          results.push({ bank: i.displayName, ok: true, ...(await syncConnection(ctx.userId, i.id, ctx.tz)) });
        } catch (e) {
          results.push({
            bank: i.displayName,
            ok: false,
            error: e instanceof PlaidError ? e.message : "Sync failed",
            needsReconnect: e instanceof PlaidError && e.reauth,
          });
        }
      }
      return { results, viewAt: "/finances/accounts" };
    },
  }),
  defineTool({
    name: "safe_to_spend",
    description:
      "How much the user can safely spend today and this week: cash and checking minus bills due before the next paycheck and planned goal savings, spread over the days until then. Includes the method, so explain it briefly.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return centsToDollarsDeep({ ...(await ctx.run((s) => safeToSpend(s, ctx.today))), viewAt: "/money" });
    },
  }),
  defineTool({
    name: "cash_forecast",
    description:
      "Day-by-day checking balance projection with known bills and typical spending, with and without expected pay. Warns before an overdraft or a bill that may not be covered.",
    schema: z.object({ days: z.number().int().min(7).max(90).default(30) }),
    mutates: false,
    async execute({ days }, ctx) {
      const f = await ctx.run((s) => cashForecast(s, ctx.today, days));
      // Weekly points are enough for the model; the page shows every day.
      return centsToDollarsDeep({ ...f, points: f.points.filter((_, i) => i % 7 === 0 || i === f.points.length - 1), viewAt: "/money" });
    },
  }),
  defineTool({
    name: "budget_check",
    description:
      "Every budget this month with its pace: on track, heading over (projected), or over, plus a specific fix such as which purchases to skip. Use for 'am I on track' and to warn early.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const w = await ctx.run((s) => budgetWarnings(s, ctx.today));
      return centsToDollarsDeep({
        budgets: w.map(({ childIds: _c, color: _co, ...b }) => b),
        viewAt: "/finances/budgets",
      });
    },
  }),
  defineTool({
    name: "suggest_budgets",
    description:
      "Build a budget plan from the user's last 3 full months: 'history' (recent averages), '50_30_20' (needs/wants/savings from income), or 'zero_based' (every dollar assigned). Show the plan and ask before applying.",
    schema: z.object({ method: z.enum(BUDGET_METHODS).default("history") }),
    mutates: false,
    async execute({ method }, ctx) {
      return centsToDollarsDeep(await ctx.run((s) => suggestBudgets(s, ctx.today, method)));
    },
  }),
  defineTool({
    name: "apply_budget_plan",
    description: "Save budget lines for a month (after the user agreed to a plan from suggest_budgets). Lines use category names and monthly dollars.",
    schema: z.object({
      month: dateArg("Any date in the month").optional(),
      lines: z
        .array(z.object({ category: z.string().min(1).max(80), monthlyLimit: moneyArg("Limit") }))
        .min(1)
        .max(40),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const lines = [];
        for (const l of a.lines) {
          const c = await resolveCategory(s, l.category);
          if (!c) throw new Error(`No category named "${l.category}". Use list_categories.`);
          lines.push({ categoryId: c.category.id, limitCents: toCents(l.monthlyLimit) });
        }
        const r = await applyBudgetPlan(s, { month: a.month ?? ctx.today, lines });
        return { saved: r.saved, viewAt: "/finances/budgets" };
      });
    },
  }),
  defineTool({
    name: "recategorize_transaction",
    description:
      "Change a transaction's category (and optionally its type). LifeFlow learns the merchant as a rule for future transactions. Set applyToPast to also fix earlier transactions from the same merchant.",
    schema: z.object({
      id: idArg("Transaction"),
      category: z.string().min(1).max(80),
      kind: z.enum(TRANSACTION_KINDS).optional(),
      applyToPast: z.boolean().default(false),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const c = await resolveCategory(s, a.category);
        if (!c) throw new Error(`No category named "${a.category}". Use list_categories.`);
        const row = await updateTransaction(s, a.id, { categoryId: c.category.id, kind: a.kind }, { learn: true });
        const past = a.applyToPast && row.learnedRule ? await applyRuleToPast(s, row.learnedRule.id) : 0;
        return {
          updated: { id: row.id, description: row.description, category: c.category.name, kind: row.kind },
          ruleLearned: row.learnedRule ? `Future ${row.learnedRule.merchant} transactions will be ${c.category.name}.` : null,
          pastUpdated: past,
          pastNotUpdated: !a.applyToPast ? (row.learnedRule?.othersToUpdate ?? 0) : 0,
          viewAt: "/finances/transactions",
        };
      });
    },
  }),
  defineTool({
    name: "edit_transaction",
    description: "Change a transaction's note, merchant name, or whether it's hidden from totals. Use recategorize_transaction for categories.",
    schema: z.object({
      id: idArg("Transaction"),
      notes: z.string().max(2000).optional(),
      merchantName: z.string().max(200).optional(),
      hidden: z.boolean().optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const row = await ctx.run((s) => updateTransaction(s, a.id, { notes: a.notes, merchantName: a.merchantName, excluded: a.hidden }));
      return { updated: { id: row.id, description: row.description, notes: row.notes, hidden: row.excluded }, viewAt: "/finances/transactions" };
    },
  }),
  defineTool({
    name: "delete_transaction",
    description: "Delete a manually entered or imported transaction (synced bank transactions can only be hidden). Requires the user's confirmation.",
    schema: z.object({ id: idArg("Transaction") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const t = await ctx.run(async (s) => {
        const [row] = await s.tx
          .select()
          .from(transactions)
          .where(and(eq(transactions.id, id), eq(transactions.userId, s.userId)));
        if (!row) throw notFound("Transaction");
        return row;
      });
      return `Delete "${t.description}" (${usd(t.amountCents / 100)}) from ${t.date}?`;
    },
    async execute({ id }, ctx) {
      await ctx.run((s) => deleteTransaction(s, id));
      return { deleted: id, viewAt: "/finances/transactions" };
    },
  }),
  defineTool({
    name: "list_goals",
    description: "The user's goals with saved amount, monthly pace, projected finish date, whether they're on track, and any milestone to celebrate.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const g = await ctx.run((s) => goalsWithPlans(s, ctx.today));
      return centsToDollarsDeep({ goals: g.map(({ recentContributions: _r, userId: _u, ...x }) => x), viewAt: "/finances/goals" });
    },
  }),
  defineTool({
    name: "create_goal",
    description:
      "Create a savings, debt or investing goal (emergency fund, travel, car, apartment, laptop...). Ask for the target and date if unknown; a monthly plan helps the projection.",
    schema: z.object({
      name: z.string().min(1).max(120),
      target: moneyArg("Target amount"),
      targetDate: dateArg().optional(),
      monthlyPlan: moneyArg("How much they plan to put in each month").optional(),
      alreadySaved: moneyArg("Already saved").optional(),
      purpose: z.enum(PURPOSES).default("other"),
      kind: z.enum(["savings", "debt", "investment"]).default("savings"),
    }),
    mutates: true,
    async execute(a, ctx) {
      const g = await ctx.run((s) =>
        createGoal(s, {
          name: a.name,
          targetCents: toCents(a.target),
          targetDate: a.targetDate,
          monthlyPlanCents: a.monthlyPlan != null ? toCents(a.monthlyPlan) : null,
          savedCents: a.alreadySaved ? toCents(a.alreadySaved) : 0,
          purpose: a.purpose,
          kind: a.kind,
        }),
      );
      return centsToDollarsDeep({
        created: { id: g.id, name: g.name, targetCents: g.targetCents, targetDate: g.targetDate, monthlyPlanCents: g.monthlyPlanCents },
        viewAt: "/finances/goals",
      });
    },
  }),
  defineTool({
    name: "update_goal",
    description: "Change a goal's name, target, date or monthly plan, or mark it achieved/archived.",
    schema: z.object({
      id: idArg("Goal"),
      name: z.string().min(1).max(120).optional(),
      target: moneyArg("Target").optional(),
      targetDate: dateArg().nullable().optional(),
      monthlyPlan: moneyArg("Monthly plan").nullable().optional(),
      status: z.enum(["active", "achieved", "archived"]).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const g = await ctx.run((s) =>
        updateGoal(s, a.id, {
          name: a.name,
          ...(a.target != null && { targetCents: toCents(a.target) }),
          ...(a.targetDate !== undefined && { targetDate: a.targetDate }),
          ...(a.monthlyPlan !== undefined && { monthlyPlanCents: a.monthlyPlan == null ? null : toCents(a.monthlyPlan) }),
          status: a.status,
        }),
      );
      return centsToDollarsDeep({
        updated: { id: g.id, name: g.name, targetCents: g.targetCents, targetDate: g.targetDate, monthlyPlanCents: g.monthlyPlanCents, status: g.status },
        viewAt: "/finances/goals",
      });
    },
  }),
  defineTool({
    name: "delete_goal",
    description: "Delete a goal and its contribution history. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Goal") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const [g] = await ctx.run((s) =>
        s.tx
          .select()
          .from(financialGoals)
          .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, s.userId))),
      );
      if (!g) throw notFound("Goal");
      return `Delete the goal "${g.name}" and its history?`;
    },
    async execute({ id }, ctx) {
      const g = await ctx.run((s) => deleteGoal(s, id));
      return { deleted: g.name, viewAt: "/finances/goals" };
    },
  }),
  defineTool({
    name: "contribute_to_goal",
    description:
      "Record money the user set aside for a goal ('move $50 to my savings goal'). LifeFlow records it; it does not move money between banks, so remind them to make the transfer themselves if they haven't. Requires confirmation. Negative amounts record a withdrawal.",
    schema: z.object({ goalId: idArg("Goal"), amount: moneyArg("Amount set aside"), date: dateArg().optional(), note: z.string().max(300).optional() }),
    mutates: true,
    async confirm(a, ctx) {
      const [g] = await ctx.run((s) =>
        s.tx
          .select()
          .from(financialGoals)
          .where(and(eq(financialGoals.id, a.goalId), eq(financialGoals.userId, s.userId))),
      );
      if (!g) throw notFound("Goal");
      return a.amount >= 0 ? `Record ${usd(a.amount)} set aside for "${g.name}"?` : `Record a ${usd(-a.amount)} withdrawal from "${g.name}"?`;
    },
    async execute(a, ctx) {
      const r = await ctx.run((s) =>
        contributeToGoal(s, { goalId: a.goalId, amountCents: toCents(a.amount), date: a.date ?? ctx.today, note: a.note }, "jarvis"),
      );
      return centsToDollarsDeep({
        recorded: { amountCents: r.contribution.amountCents, date: r.contribution.date },
        savedCents: r.savedCents,
        targetCents: r.targetCents,
        achieved: r.achieved,
        note: "Recorded in LifeFlow. No money was moved between accounts.",
        viewAt: "/finances/goals",
      });
    },
  }),
  defineTool({
    name: "goal_tradeoff",
    description:
      "How much sooner a goal finishes if the user puts in more each month (e.g. 'cutting $60 a month on dining gets you to Japan 3 months sooner').",
    schema: z.object({ goalId: idArg("Goal"), extraMonthly: moneyArg("Extra per month (negative for less)") }),
    mutates: false,
    async execute(a, ctx) {
      const goals = await ctx.run((s) => goalsWithPlans(s, ctx.today));
      const g = goals.find((x) => x.id === a.goalId);
      if (!g) throw notFound("Goal");
      return centsToDollarsDeep({
        goal: g.name,
        currentMonthlyCents: g.monthlyPaceCents,
        extraMonthlyCents: toCents(a.extraMonthly),
        ...goalTradeoff(g, g.monthlyPaceCents, toCents(a.extraMonthly)),
      });
    },
  }),
  defineTool({
    name: "plan_paycheck",
    description: "Split a paycheck across bills due before the next one, budgets for that stretch, goal plans and savings, and show what's free to spend.",
    schema: z.object({
      amount: moneyArg("Paycheck amount"),
      nextPayDate: dateArg("Date of the following paycheck").optional(),
      savingsPercent: z.number().min(0).max(80).optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep(
        await ctx.run((s) => planPaycheck(s, ctx.today, toCents(a.amount), { nextPayDate: a.nextPayDate, savingsPercent: a.savingsPercent })),
      );
    },
  }),
  defineTool({
    name: "find_subscriptions",
    description:
      "Recurring charges with yearly cost, price increases, overlapping services and student plans to check. Suggest what to cancel based on use, never decide for them.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const r = await ctx.run((s) => subscriptionReport(s, ctx.today));
      return centsToDollarsDeep({ ...r, items: r.items.map(({ merchantKey: _m, ...i }) => i), viewAt: "/finances/bills" });
    },
  }),
  defineTool({
    name: "debt_plan",
    description:
      "Debts with rates and minimums, credit utilization, avalanche and snowball order, a payoff timeline with an optional extra monthly payment, and credit basics.",
    schema: z.object({ extraMonthly: moneyArg("Extra paid toward debt each month").optional() }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep(await ctx.run((s) => debtReport(s, ctx.today, a.extraMonthly ? toCents(a.extraMonthly) : 0)));
    },
  }),
  defineTool({
    name: "update_account_details",
    description:
      "Update an account's balance, credit limit, interest rate (APR %), minimum payment or next due date. Changing accounts requires the user's confirmation.",
    schema: z.object({
      id: idArg("Account"),
      balance: moneyArg("Current balance (amount owed for cards/loans)").optional(),
      creditLimit: moneyArg("Credit limit").optional(),
      aprPercent: z.number().min(0).max(100).optional(),
      minimumPayment: moneyArg("Minimum payment").optional(),
      nextDueDate: dateArg().optional(),
    }),
    mutates: true,
    async confirm(a, ctx) {
      const [acct] = await ctx.run((s) =>
        s.tx
          .select()
          .from(financialAccounts)
          .where(and(eq(financialAccounts.id, a.id), eq(financialAccounts.userId, s.userId))),
      );
      if (!acct) throw notFound("Account");
      const parts = [
        a.balance != null && `balance ${usd(a.balance)}`,
        a.creditLimit != null && `limit ${usd(a.creditLimit)}`,
        a.aprPercent != null && `APR ${a.aprPercent}%`,
        a.minimumPayment != null && `minimum ${usd(a.minimumPayment)}`,
        a.nextDueDate && `due ${a.nextDueDate}`,
      ].filter(Boolean);
      return `Update ${acct.name}: ${parts.join(", ")}?`;
    },
    async execute(a, ctx) {
      const row = await ctx.run(async (s) => {
        const [r] = await s.tx
          .update(financialAccounts)
          .set({
            ...(a.balance != null && { currentBalanceCents: toCents(a.balance), balanceUpdatedAt: new Date() }),
            ...(a.creditLimit != null && { creditLimitCents: toCents(a.creditLimit) }),
            ...(a.aprPercent != null && { aprBps: Math.round(a.aprPercent * 100) }),
            ...(a.minimumPayment != null && { minPaymentCents: toCents(a.minimumPayment) }),
            ...(a.nextDueDate && { nextPaymentDueDate: a.nextDueDate }),
          })
          .where(and(eq(financialAccounts.id, a.id), eq(financialAccounts.userId, s.userId), eq(financialAccounts.source, "manual")))
          .returning();
        if (!r) throw new Error("Account not found, or it's synced from a bank (its balance updates automatically).");
        return r;
      });
      return centsToDollarsDeep({
        updated: { id: row.id, name: row.name, currentBalanceCents: row.currentBalanceCents, aprPercent: row.aprBps != null ? row.aprBps / 100 : null },
        viewAt: "/finances/accounts",
      });
    },
  }),
  defineTool({
    name: "emergency_fund_plan",
    description:
      "Essential monthly costs from real spending, a 3-month emergency fund target, how much is covered, the monthly amount to finish in a year, savings challenges, and last month's round-up total.",
    schema: z.object({ months: z.number().int().min(1).max(12).default(3) }),
    mutates: false,
    async execute({ months }, ctx) {
      return centsToDollarsDeep(await ctx.run(async (s) => ({ ...(await emergencyFundPlan(s, ctx.today, months)), roundUps: await roundUps(s, ctx.today) })));
    },
  }),
  defineTool({
    name: "financial_health",
    description:
      "A 0 to 100 health score from the user's own data (saving rate, emergency fund, overdraft risk, card utilization, debt load, budgets) with the top steps to improve. Not a credit score.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return centsToDollarsDeep({ ...(await ctx.run((s) => financialHealth(s, ctx.today))), viewAt: "/money" });
    },
  }),
  defineTool({
    name: "investment_overview",
    description: `Holdings, allocation, return, concentration, fund fees and plain-language notes. ${GENERAL_INFO} Never recommend buying or selling a specific security.`,
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return centsToDollarsDeep({ ...(await ctx.run((s) => investmentReport(s))), viewAt: "/wealth" });
    },
  }),
  defineTool({
    name: "investing_projection",
    description:
      "Compound growth of a starting amount plus a monthly contribution over N years at a range of assumed returns (e.g. '$100 a month from age 20'). Always present the rates as assumptions.",
    schema: z.object({
      start: moneyArg("Starting amount").default(0),
      monthly: moneyArg("Monthly contribution"),
      years: z.number().int().min(1).max(60),
      ratesPercent: z.array(z.number().min(0).max(15)).max(4).optional(),
    }),
    mutates: false,
    async execute(a) {
      return centsToDollarsDeep(
        projectInvesting({ startCents: toCents(a.start), monthlyCents: toCents(a.monthly), years: a.years, ratesPercent: a.ratesPercent }),
      );
    },
  }),
  defineTool({
    name: "money_checkin",
    description:
      "A money check-in: 'daily' (spent and safe to spend), 'weekly' (week vs last week, budget pace, bills ahead) or 'monthly' (full report with savings rate, net worth change, goals and health score).",
    schema: z.object({
      kind: z.enum(["daily", "weekly", "monthly"]),
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe("YYYY-MM for a monthly report"),
    }),
    mutates: false,
    async execute(a, ctx) {
      const r: object = await ctx.run((s): Promise<object> =>
        a.kind === "daily"
          ? dailyCheckin(s, ctx.today)
          : a.kind === "weekly"
            ? weeklyCheckin(s, ctx.today)
            : monthlyReport(s, ctx.today, a.month ? `${a.month}-01` : undefined),
      );
      return centsToDollarsDeep({ ...r, viewAt: a.kind === "monthly" ? "/money/report" : "/money" });
    },
  }),
  defineTool({
    name: "money_lesson",
    description:
      "A short plain-language lesson (compounding, index funds, risk, Roth IRA, fees, emergency fund, credit utilization, 50/30/20). Tie it to the user's own numbers when you can.",
    schema: z.object({ topic: z.enum(LESSONS.map((l) => l.id) as [string, ...string[]]) }),
    mutates: false,
    async execute({ topic }) {
      const l = LESSONS.find((x) => x.id === topic)!;
      return { ...l, disclaimer: GENERAL_INFO };
    },
  }),
];
