import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { addDaysStr, DATE_RE, daysBetween } from "@/lib/dates";
import { financialGoals, goalContributions, type DataSource } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { notFound, ServiceError } from "../errors";
import { listGoals, monthlyContributionNeeded } from "./planning";

/**
 * Goals: the user's dreams with a number and a date. Contributions record
 * money the user set aside; LifeFlow never moves money itself.
 */

export const contributionSchema = z.object({
  goalId: z.string().uuid(),
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount cannot be zero")
    .refine((n) => Math.abs(n) <= 100_000_000, "Amount is too large"),
  date: z.string().regex(DATE_RE),
  note: z.string().max(300).nullish(),
});

/** Months from today to a YYYY-MM-DD date, rounded, at least 0. */
const monthsUntil = (today: string, date: string) => Math.max(0, Math.round(daysBetween(today, date) / 30.44));
const addMonths = (today: string, months: number) => addDaysStr(today, Math.round(months * 30.44));

/** When the goal finishes at a monthly pace, and how a change in pace moves it. Pure. */
export function goalProjection(g: { targetCents: number; savedCents: number; targetDate: string | null }, monthlyCents: number, today: string) {
  const remaining = Math.max(0, g.targetCents - g.savedCents);
  if (remaining === 0) return { remainingCents: 0, monthsToGo: 0, projectedDate: today, onTrack: true };
  if (monthlyCents <= 0) return { remainingCents: remaining, monthsToGo: null, projectedDate: null, onTrack: g.targetDate ? false : null };
  const months = Math.ceil(remaining / monthlyCents);
  const projectedDate = addMonths(today, months);
  return { remainingCents: remaining, monthsToGo: months, projectedDate, onTrack: g.targetDate ? projectedDate <= g.targetDate : null };
}

/** "Cutting $60 a month gets you there N months sooner." Pure. */
export function goalTradeoff(g: { targetCents: number; savedCents: number }, monthlyCents: number, extraMonthlyCents: number) {
  const remaining = Math.max(0, g.targetCents - g.savedCents);
  const before = monthlyCents > 0 ? Math.ceil(remaining / monthlyCents) : null;
  const after = monthlyCents + extraMonthlyCents > 0 ? Math.ceil(remaining / (monthlyCents + extraMonthlyCents)) : null;
  return { monthsBefore: before, monthsAfter: after, monthsSooner: before != null && after != null ? before - after : null };
}

export async function contributeToGoal(scope: UserScope, input: z.input<typeof contributionSchema>, source: DataSource = "manual") {
  const d = contributionSchema.parse(input);
  const [goal] = await scope.tx
    .select()
    .from(financialGoals)
    .where(and(eq(financialGoals.id, d.goalId), eq(financialGoals.userId, scope.userId)));
  if (!goal) throw notFound("Goal");
  if (goal.accountId) throw new ServiceError("This goal tracks a linked account's balance, so it updates when that account does.");
  const newSaved = goal.savedCents + d.amountCents;
  if (newSaved < 0) throw new ServiceError("That would take the goal below $0.");
  const [row] = await scope.tx
    .insert(goalContributions)
    .values({ userId: scope.userId, goalId: d.goalId, amountCents: d.amountCents, date: d.date, note: d.note ?? null, source })
    .returning();
  await scope.tx
    .update(financialGoals)
    .set({ savedCents: newSaved, ...(newSaved >= goal.targetCents && goal.status === "active" && { status: "achieved" as const }) })
    .where(eq(financialGoals.id, goal.id));
  return { contribution: row, savedCents: newSaved, targetCents: goal.targetCents, achieved: newSaved >= goal.targetCents };
}

export async function deleteContribution(scope: UserScope, id: string) {
  const [c] = await scope.tx
    .select()
    .from(goalContributions)
    .where(and(eq(goalContributions.id, id), eq(goalContributions.userId, scope.userId)));
  if (!c) throw notFound("Contribution");
  const [goal] = await scope.tx.select().from(financialGoals).where(eq(financialGoals.id, c.goalId));
  await scope.tx.delete(goalContributions).where(eq(goalContributions.id, id));
  if (goal && !goal.accountId)
    await scope.tx
      .update(financialGoals)
      .set({ savedCents: Math.max(0, goal.savedCents - c.amountCents) })
      .where(eq(financialGoals.id, goal.id));
}

export async function deleteGoal(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(financialGoals)
    .where(and(eq(financialGoals.id, id), eq(financialGoals.userId, scope.userId)))
    .returning({ id: financialGoals.id, name: financialGoals.name });
  if (!row) throw notFound("Goal");
  return row;
}

/** Goals with pace, projected finish, and the next milestone to celebrate. */
export async function goalsWithPlans(scope: UserScope, today: string) {
  const goals = await listGoals(scope);
  const since = addDaysStr(today, -90);
  const contributions = await scope.tx
    .select()
    .from(goalContributions)
    .where(and(eq(goalContributions.userId, scope.userId), gte(goalContributions.date, since)))
    .orderBy(desc(goalContributions.date));
  return goals.map((g) => {
    const recent = contributions.filter((c) => c.goalId === g.id);
    const recentMonthly = Math.round((recent.reduce((s, c) => s + c.amountCents, 0) / 90) * 30.44);
    const needed = monthlyContributionNeeded(g.targetCents, g.savedCents, g.targetDate, today);
    const pace = g.monthlyPlanCents ?? (recentMonthly > 0 ? recentMonthly : 0);
    const projection = goalProjection(g, pace, today);
    const milestone = [25, 50, 75, 100].filter((m) => g.percent >= m && m > g.celebratedPercent).pop() ?? null;
    return {
      ...g,
      monthlyNeededCents: needed,
      monthlyPaceCents: pace,
      paceSource: g.monthlyPlanCents ? ("plan" as const) : recentMonthly > 0 ? ("recent" as const) : ("none" as const),
      recentContributions: recent.slice(0, 5),
      monthsLeft: g.targetDate ? monthsUntil(today, g.targetDate) : null,
      ...projection,
      milestoneToCelebrate: milestone,
    };
  });
}
export type GoalPlan = Awaited<ReturnType<typeof goalsWithPlans>>[number];

export async function markMilestoneCelebrated(scope: UserScope, goalId: string, percent: number) {
  await scope.tx
    .update(financialGoals)
    .set({ celebratedPercent: percent })
    .where(and(eq(financialGoals.id, goalId), eq(financialGoals.userId, scope.userId)));
}
