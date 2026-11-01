import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { financialGoals, goalCheckins, personalGoals } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { series } from "../db/series";
import { ServiceError, notFound } from "./errors";
import { contributeToGoal } from "./finance/goals";
import { updatePersonalGoal } from "./personal-goals";

/**
 * Goal check-ins: Jarvis asks "how did you work toward your goal today?" and the answer is
 * kept in the user's own words. Goals are just goals: "walked more, ate less" for a health
 * goal, "skipped eating out, saved $20" for the car fund. A money check-in with an amount
 * also records that contribution; a measured personal goal can move forward.
 */

export type GoalRef = { kind: "personal" | "money"; id: string; title: string; detail: string | null };

const checkinSchema = z.object({
  goalKind: z.enum(["personal", "money"]),
  goalId: z.string().uuid(),
  note: z.string().trim().min(1, "Say what you did.").max(500),
  /** Money goals: what was put toward it, in cents (only when the user said an amount). */
  amountCents: z.number().int().positive().max(100_000_000).nullish(),
  /** Measured personal goals: how much to add (1 more book). */
  progress: z.number().int().min(1).max(100_000).nullish(),
});

/** Every goal that's still open, money or not. Money ones only when Money isn't locked. */
export async function openGoals(scope: UserScope, opts: { money?: boolean } = {}): Promise<GoalRef[]> {
  const [personal, money] = await series(
    () =>
      scope.tx
        .select()
        .from(personalGoals)
        .where(and(eq(personalGoals.userId, scope.userId), isNull(personalGoals.doneAt))),
    () =>
      opts.money === false
        ? Promise.resolve([])
        : scope.tx
            .select()
            .from(financialGoals)
            .where(and(eq(financialGoals.userId, scope.userId), eq(financialGoals.status, "active"))),
  );
  return [
    ...personal.map((g) => ({
      kind: "personal" as const,
      id: g.id,
      title: g.title,
      detail: g.target != null ? `${g.progress} of ${g.target}${g.unit ? ` ${g.unit}` : ""}` : null,
    })),
    ...money.map((g) => ({
      kind: "money" as const,
      id: g.id,
      title: g.name,
      detail: `$${Math.round(g.savedCents / 100).toLocaleString("en-US")} of $${Math.round(g.targetCents / 100).toLocaleString("en-US")}`,
    })),
  ];
}

export async function logGoalCheckin(scope: UserScope, today: string, input: z.input<typeof checkinSchema>) {
  const d = checkinSchema.parse(input);
  if (d.goalKind === "money") {
    const [g] = await scope.tx
      .select()
      .from(financialGoals)
      .where(and(eq(financialGoals.id, d.goalId), eq(financialGoals.userId, scope.userId)));
    if (!g) throw notFound("Goal");
    if (d.progress) throw new ServiceError("Money goals move by an amount, not a count.");
    if (d.amountCents) await contributeToGoal(scope, { goalId: g.id, amountCents: d.amountCents, date: today, note: d.note.slice(0, 200) });
  } else {
    const [g] = await scope.tx
      .select()
      .from(personalGoals)
      .where(and(eq(personalGoals.id, d.goalId), eq(personalGoals.userId, scope.userId)));
    if (!g) throw notFound("Goal");
    if (d.amountCents) throw new ServiceError("That goal isn't about money, so there's no amount to add.");
    if (d.progress && g.target != null) await updatePersonalGoal(scope, g.id, { progress: g.progress + d.progress });
  }
  const [row] = await scope.tx
    .insert(goalCheckins)
    .values({
      userId: scope.userId,
      goalKind: d.goalKind,
      goalId: d.goalId,
      date: today,
      note: d.note,
      amountCents: d.amountCents ?? null,
      progress: d.progress ?? null,
    })
    .returning();
  return row;
}

/** Latest check-ins per goal (newest first), for the Goals page. */
export async function recentCheckins(scope: UserScope, goalIds: string[], perGoal = 3) {
  if (!goalIds.length) return new Map<string, (typeof goalCheckins.$inferSelect)[]>();
  const rows = await scope.tx
    .select()
    .from(goalCheckins)
    .where(and(eq(goalCheckins.userId, scope.userId), inArray(goalCheckins.goalId, goalIds)))
    .orderBy(desc(goalCheckins.date), desc(goalCheckins.createdAt))
    .limit(goalIds.length * perGoal * 3);
  const out = new Map<string, (typeof goalCheckins.$inferSelect)[]>();
  for (const r of rows) {
    const list = out.get(r.goalId) ?? [];
    if (list.length < perGoal) list.push(r);
    out.set(r.goalId, list);
  }
  return out;
}

/** Goal ids checked in on this day. */
export async function checkedInOn(scope: UserScope, day: string) {
  const rows = await scope.tx
    .select({ goalId: goalCheckins.goalId })
    .from(goalCheckins)
    .where(and(eq(goalCheckins.userId, scope.userId), eq(goalCheckins.date, day)));
  return new Set(rows.map((r) => r.goalId));
}
