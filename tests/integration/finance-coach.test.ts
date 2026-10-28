import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { applyRuleToPast, listCategoryRules } from "@/server/services/finance/categorize";
import { debtReport, financialHealth, planPaycheck } from "@/server/services/finance/coach";
import { cashForecast, safeToSpend } from "@/server/services/finance/forecast";
import { contributeToGoal, goalsWithPlans } from "@/server/services/finance/goals";
import { createGoal, createRecurring } from "@/server/services/finance/planning";
import { applyBudgetPlan, suggestBudgets } from "@/server/services/finance/smart-budgets";
import { createTransaction, queryTransactions, updateTransaction } from "@/server/services/finance/transactions";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TODAY = "2026-10-28";

async function userWithHistory() {
  const u = await makeUser();
  const ids = await u.run(async (s) => {
    const checking = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 120_000 });
    const card = await createManualAccount(s, { name: "Visa", type: "credit", currentBalanceCents: 90_000, creditLimitCents: 200_000 });
    const pay = (await getCategoryByName(s, "Paycheck"))!;
    const rent = (await getCategoryByName(s, "Rent"))!;
    for (const m of ["2026-07", "2026-08", "2026-09"]) {
      await createTransaction(s, { accountId: checking.id, date: `${m}-01`, description: "Payroll", amountCents: 300_000, categoryId: pay.id });
      await createTransaction(s, { accountId: checking.id, date: `${m}-02`, description: "Rent", amountCents: -120_000, categoryId: rent.id });
      await createTransaction(s, { accountId: card.id, date: `${m}-10`, description: "DOORDASH ORDER", amountCents: -30_000 });
      await createTransaction(s, { accountId: card.id, date: `${m}-12`, description: "TRADER JOE'S", amountCents: -20_000 });
    }
    return { checking, card, rent };
  });
  return { ...u, ...ids };
}

describe("categorization that learns", () => {
  it("auto-categorizes known merchants, learns from a correction, and can fix the past", async () => {
    const u = await userWithHistory();
    const txns = await u.run((s) => queryTransactions(s, { search: "doordash" }));
    expect(txns.every((t) => t.categoryName === "Food Delivery")).toBe(true);
    const restaurants = (await u.run((s) => getCategoryByName(s, "Restaurants")))!;
    const updated = await u.run((s) => updateTransaction(s, txns[0].id, { categoryId: restaurants.id }, { learn: true }));
    expect(updated.learnedRule).toMatchObject({ merchant: "DOORDASH ORDER", othersToUpdate: 2 });
    // New transactions follow the rule.
    const fresh = await u.run((s) => createTransaction(s, { accountId: u.card.id, date: TODAY, description: "DOORDASH ORDER", amountCents: -1_500 }));
    expect(fresh!.categoryId).toBe(restaurants.id);
    expect(await u.run((s) => applyRuleToPast(s, updated.learnedRule!.id))).toBe(2);
    expect((await u.run((s) => queryTransactions(s, { search: "doordash" }))).every((t) => t.categoryName === "Restaurants")).toBe(true);
    expect(await u.run(listCategoryRules)).toHaveLength(1);
  });
});

describe("smart budgets", () => {
  it("builds history, 50/30/20 and zero-based plans from the last three months", async () => {
    const u = await userWithHistory();
    const h = await u.run((s) => suggestBudgets(s, TODAY, "history"));
    expect(h.months).toBe(3);
    expect(h.averageIncomeCents).toBe(300_000);
    expect(h.lines.find((l) => l.category === "Housing")).toMatchObject({ averageCents: 120_000, suggestedCents: 120_000, group: "need" });
    const f = await u.run((s) => suggestBudgets(s, TODAY, "50_30_20"));
    const needs = f.lines.filter((l) => l.group === "need").reduce((s, l) => s + l.suggestedCents, 0);
    expect(needs).toBeGreaterThanOrEqual(150_000);
    expect(needs).toBeLessThan(151_000);
    const z = await u.run((s) => suggestBudgets(s, TODAY, "zero_based"));
    expect(z.totalCents + z.goalPlansCents + z.savingsCents).toBe(z.averageIncomeCents);
    const r = await u.run((s) => applyBudgetPlan(s, { month: TODAY, lines: h.lines.map((l) => ({ categoryId: l.categoryId, limitCents: l.suggestedCents })) }));
    expect(r.saved).toBe(h.lines.length);
  });
  it("explains when there is no history yet", async () => {
    const { run } = await makeUser();
    await expect(run((s) => suggestBudgets(s, TODAY, "history"))).rejects.toThrow(/full month/);
  });
});

describe("safe to spend, forecast, goals and health", () => {
  it("connects bills, goals and expected pay", async () => {
    const u = await userWithHistory();
    await u.run(async (s) => {
      await createRecurring(s, { name: "Rent", amountCents: -120_000, frequency: "monthly", nextDueDate: "2026-11-01", kind: "bill", categoryId: u.rent.id });
      await createRecurring(s, { name: "Payroll", amountCents: 150_000, frequency: "biweekly", nextDueDate: "2026-11-06", kind: "income" });
      const g = await createGoal(s, { name: "Japan trip", targetCents: 300_000, monthlyPlanCents: 30_000, purpose: "travel" });
      await contributeToGoal(s, { goalId: g.id, amountCents: 75_000, date: TODAY });
    });
    const safe = await u.run((s) => safeToSpend(s, TODAY));
    expect(safe).toMatchObject({ until: "2026-11-06", untilReason: "next_pay", billsDueCents: 120_000, cashCents: 120_000 });
    expect(safe.goalSetAsideCents).toBe(Math.round((30_000 * 9) / 30));
    expect(safe.todayCents).toBe(0); // rent leaves nothing free before payday
    expect(safe.short).toBe(true);

    const f = await u.run((s) => cashForecast(s, TODAY, 14));
    expect(f.expectedPay[0]).toMatchObject({ date: "2026-11-06", amountCents: 150_000 });
    expect(f.overdraftDateWithoutPay).not.toBeNull();
    expect(f.warnings.length).toBeGreaterThan(0);

    const [goal] = await u.run((s) => goalsWithPlans(s, TODAY));
    expect(goal).toMatchObject({ savedCents: 75_000, percent: 25, monthlyPaceCents: 30_000, monthsToGo: 8, milestoneToCelebrate: 25, paceSource: "plan" });

    const plan = await u.run((s) => planPaycheck(s, TODAY, 150_000, { nextPayDate: "2026-11-11" }));
    expect(plan.billsCents).toBe(120_000);
    expect(plan.goalsCents).toBeGreaterThan(0);

    const debts = await u.run((s) => debtReport(s, TODAY));
    expect(debts).toMatchObject({ totalOwedCents: 90_000, overallUtilizationPercent: 45 });

    const health = await u.run((s) => financialHealth(s, TODAY));
    expect(health.score).not.toBeNull();
    expect(health.factors.map((x) => x.key)).toEqual(expect.arrayContaining(["savings_rate", "cash_cushion", "credit_utilization"]));
    expect(health.nextSteps.length).toBeGreaterThan(0);
  });

  it("refuses contributions that would make a goal negative", async () => {
    const { run } = await makeUser();
    const g = await run((s) => createGoal(s, { name: "Laptop", targetCents: 100_000 }));
    await expect(run((s) => contributeToGoal(s, { goalId: g.id, amountCents: -5_000, date: TODAY }))).rejects.toThrow(/below \$0/);
  });
});
