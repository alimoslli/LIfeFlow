import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { DATE_RE } from "@/lib/dates";
import { personalGoals } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { notFound } from "./errors";

/**
 * Goals that aren't about money: "Run a 5K", "Read 12 books", "Get a B in Chem".
 * A goal can have a measure (12 books) or be simply done or not done. Reaching the
 * measure marks it done. Money goals stay in services/finance/goals.ts.
 */

export const personalGoalSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a name.").max(200),
  target: z.number().int().min(1).max(1_000_000).nullish(),
  unit: z.string().trim().max(40).nullish(),
  targetDate: z.string().regex(DATE_RE).nullish(),
});
export type PersonalGoalInput = z.input<typeof personalGoalSchema>;

export type PersonalGoalChange = Partial<PersonalGoalInput> & { progress?: number; done?: boolean };

export async function listPersonalGoals(scope: UserScope) {
  return scope.tx
    .select()
    .from(personalGoals)
    .where(eq(personalGoals.userId, scope.userId))
    .orderBy(sql`${personalGoals.doneAt} is not null`, asc(personalGoals.targetDate), desc(personalGoals.createdAt));
}

export async function createPersonalGoal(scope: UserScope, input: PersonalGoalInput) {
  const d = personalGoalSchema.parse(input);
  const [row] = await scope.tx
    .insert(personalGoals)
    .values({ userId: scope.userId, title: d.title, target: d.target ?? null, unit: d.unit || null, targetDate: d.targetDate ?? null })
    .returning();
  return row;
}

export async function updatePersonalGoal(scope: UserScope, id: string, change: PersonalGoalChange) {
  const [cur] = await scope.tx
    .select()
    .from(personalGoals)
    .where(and(eq(personalGoals.id, id), eq(personalGoals.userId, scope.userId)));
  if (!cur) throw notFound("Goal");
  const d = personalGoalSchema.partial().parse(change);
  const target = d.target !== undefined ? (d.target ?? null) : cur.target;
  const progress = change.progress !== undefined ? Math.max(0, Math.min(Math.round(change.progress), target ?? 1_000_000)) : cur.progress;
  // Done when asked, or when the measure is reached; un-done when asked or progress drops below it.
  const reached = target != null && progress >= target;
  const done = change.done ?? (change.progress !== undefined || d.target !== undefined ? reached : !!cur.doneAt);
  const [row] = await scope.tx
    .update(personalGoals)
    .set({
      title: d.title ?? cur.title,
      target,
      unit: d.unit !== undefined ? d.unit || null : cur.unit,
      targetDate: d.targetDate !== undefined ? (d.targetDate ?? null) : cur.targetDate,
      progress: change.done && target != null ? Math.max(progress, target) : progress,
      doneAt: done ? (cur.doneAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(personalGoals.id, id))
    .returning();
  return row;
}

export async function deletePersonalGoal(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(personalGoals)
    .where(and(eq(personalGoals.id, id), eq(personalGoals.userId, scope.userId)))
    .returning({ id: personalGoals.id, title: personalGoals.title });
  if (!row) throw notFound("Goal");
  return row;
}
