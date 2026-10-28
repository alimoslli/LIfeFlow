import { series } from "@/server/db/series";
import { z } from "zod";
import { addDaysStr, monthEnd, monthStart } from "@/lib/dates";
import type { UserScope } from "../../db/with-user";
import { ServiceError } from "../errors";
import { listCategories } from "./categories";
import { needOrWant } from "./categorize";
import { rollupToParents, spendingByCategoryId, summarizeCashflow } from "./cashflow";
import { listGoals, setBudget } from "./planning";
import { queryTransactions } from "./transactions";

/**
 * Budgets built from the user's real history (the last 3 full months).
 *   history:    each category at its recent monthly average, rounded up
 *   50/30/20:   income split into needs 50%, wants 30%, savings 20%; each
 *               group's share is spread over categories by their history
 *   zero_based: every dollar of income gets a job: history-based lines,
 *               goal plans, and whatever is left goes to savings
 */
export const BUDGET_METHODS = ["history", "50_30_20", "zero_based"] as const;
export type BudgetMethod = (typeof BUDGET_METHODS)[number];

const roundUp = (cents: number, step = 500) => Math.ceil(cents / step) * step;

export type BudgetLine = { categoryId: string; category: string; group: "need" | "want"; averageCents: number; suggestedCents: number };

export async function suggestBudgets(scope: UserScope, today: string, method: BudgetMethod) {
  const end = addDaysStr(monthStart(today), -1);
  const start = monthStart(addDaysStr(monthStart(addDaysStr(monthStart(end), -1)), -1));
  const [cats, txns, goals] = await series(
    () => listCategories(scope),
    () => queryTransactions(scope, { from: start, to: monthEnd(end), limit: 20_000 }),
    () => listGoals(scope),
  );
  const months = new Set(txns.map((t) => t.date.slice(0, 7))).size;
  if (!months) throw new ServiceError("There isn't a full month of transactions yet. Add or import a month of spending first.");
  const flow = summarizeCashflow(txns);
  const avgIncome = Math.round(flow.incomeCents / months);
  const avgSpend = Math.round(flow.netSpendingCents / months);
  const byCat = rollupToParents(spendingByCategoryId(txns), cats).filter((c) => c.id && c.cents > 0);
  let lines: BudgetLine[] = byCat.map((c) => {
    const avg = Math.round(c.cents / months);
    return { categoryId: c.id!, category: c.name, group: needOrWant(c.name), averageCents: avg, suggestedCents: roundUp(avg) };
  });
  const goalPlans = goals.filter((g) => g.status === "active").reduce((s, g) => s + (g.monthlyPlanCents ?? 0), 0);
  const notes: string[] = [`Based on ${months} full month${months === 1 ? "" : "s"} of your transactions (${start} to ${monthEnd(end)}).`];

  if (method === "50_30_20") {
    if (!avgIncome) throw new ServiceError("50/30/20 needs income history. No income was recorded in the last 3 months.");
    const scale = (group: "need" | "want", share: number) => {
      const groupLines = lines.filter((l) => l.group === group);
      const hist = groupLines.reduce((s, l) => s + l.averageCents, 0);
      const target = Math.round(avgIncome * share);
      for (const l of groupLines) l.suggestedCents = roundUp(hist ? (l.averageCents / hist) * target : target / groupLines.length);
      return { target, hist };
    };
    const needs = scale("need", 0.5);
    const wants = scale("want", 0.3);
    notes.push(
      `Average monthly income ${usd(avgIncome)}: needs ${usd(needs.target)} (you've averaged ${usd(needs.hist)}), wants ${usd(wants.target)} (averaged ${usd(wants.hist)}), savings ${usd(Math.round(avgIncome * 0.2))}.`,
    );
    if (needs.hist > needs.target)
      notes.push("Your needs run above 50% of income. That's common for students; the plan trims wants first, and needs may take time to bring down.");
  }

  const totalLines = lines.reduce((s, l) => s + l.suggestedCents, 0);
  let savingsCents = Math.max(0, avgIncome - totalLines);
  if (method === "zero_based") {
    if (!avgIncome) throw new ServiceError("Zero-based budgets need income history. No income was recorded in the last 3 months.");
    const leftover = avgIncome - totalLines - goalPlans;
    savingsCents = Math.max(0, leftover);
    if (leftover < 0) {
      // Trim wants proportionally until every dollar is assigned.
      const wants = lines.filter((l) => l.group === "want");
      const wantTotal = wants.reduce((s, l) => s + l.suggestedCents, 0);
      const cut = Math.min(wantTotal, -leftover);
      for (const l of wants) l.suggestedCents = Math.max(0, roundUp(l.suggestedCents - (wantTotal ? (l.suggestedCents / wantTotal) * cut : 0), 100));
      notes.push(`Your history spends ${usd(-leftover)} more than you earn after goal plans, so wants were trimmed by ${usd(cut)}.`);
    }
    notes.push(`Every dollar has a job: ${usd(avgIncome)} income = category budgets + ${usd(goalPlans)} goal plans + ${usd(savingsCents)} to savings.`);
  }
  lines = lines.sort((a, b) => b.suggestedCents - a.suggestedCents);
  return {
    method,
    months,
    averageIncomeCents: avgIncome,
    averageSpendingCents: avgSpend,
    goalPlansCents: goalPlans,
    lines,
    totalCents: lines.reduce((s, l) => s + l.suggestedCents, 0),
    savingsCents,
    notes,
  };
}

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

export const applyPlanSchema = z.object({
  month: z.string(),
  lines: z.array(z.object({ categoryId: z.string().uuid(), limitCents: z.number().int().min(0) })).max(60),
});

/** Saves the chosen lines as this month's budgets (existing budgets for those categories are updated). */
export async function applyBudgetPlan(scope: UserScope, input: z.input<typeof applyPlanSchema>) {
  const d = applyPlanSchema.parse(input);
  for (const l of d.lines) await setBudget(scope, { month: d.month, categoryId: l.categoryId, limitCents: l.limitCents });
  return { saved: d.lines.length };
}
