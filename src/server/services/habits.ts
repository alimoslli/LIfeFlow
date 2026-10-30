import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { addDaysStr, dayOfWeek } from "@/lib/dates";
import { habitChecks, habits } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "./errors";
import { notFound } from "./errors";

/**
 * Small habits (save $10 each payday, a no-spend weekend, study 25 minutes a
 * day) with check-ins and streaks. A "period" is a day for daily habits, a
 * week for weekly ones, a weekend for weekend ones.
 */

export const habitInputSchema = z.object({
  title: z.string().trim().min(1, "Name the habit.").max(120),
  kind: z.enum(["save", "no_spend", "study", "custom"]).default("custom"),
  cadence: z.enum(["daily", "weekly", "weekends", "payday"]).default("daily"),
  target: z.number().int().min(1).max(10_000_000).nullish(),
});

export const HABIT_IDEAS = [
  { title: "Save $10 each payday", kind: "save", cadence: "payday", target: 1000 },
  { title: "No-spend weekend", kind: "no_spend", cadence: "weekends", target: null },
  { title: "Study 25 minutes a day", kind: "study", cadence: "daily", target: 25 },
] as const;

export async function createHabit(scope: UserScope, input: z.input<typeof habitInputSchema>) {
  const d = habitInputSchema.parse(input);
  const [row] = await scope.tx
    .insert(habits)
    .values({ userId: scope.userId, ...d, target: d.target ?? null })
    .returning();
  return row;
}

export async function updateHabit(scope: UserScope, id: string, patch: Partial<z.input<typeof habitInputSchema>> & { active?: boolean }) {
  const d = habitInputSchema.partial().parse(patch);
  const [row] = await scope.tx
    .update(habits)
    .set({ ...d, ...(patch.active !== undefined && { active: patch.active }) })
    .where(and(eq(habits.id, id), eq(habits.userId, scope.userId)))
    .returning();
  if (!row) throw new ServiceError("Habit not found", "not_found");
  return row;
}

export async function deleteHabit(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, scope.userId)))
    .returning({ id: habits.id, title: habits.title });
  if (!row) throw notFound("Habit");
  return row;
}

/** Marks today (or a given day) done or not done for a habit. */
export async function checkHabit(scope: UserScope, habitId: string, day: string, done = true) {
  const [h] = await scope.tx
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, scope.userId)));
  if (!h) throw new ServiceError("Habit not found", "not_found");
  await scope.tx
    .insert(habitChecks)
    .values({ userId: scope.userId, habitId, day, done })
    .onConflictDoUpdate({ target: [habitChecks.habitId, habitChecks.day], set: { done } });
}

/** The period a day belongs to, as its first day (daily: the day; weekly/payday: Monday; weekends: Saturday). */
export function periodOf(cadence: string, day: string) {
  if (cadence === "daily") return day;
  const dow = dayOfWeek(day); // 0 = Sunday
  if (cadence === "weekends") return dow === 6 ? day : dow === 0 ? addDaysStr(day, -1) : null;
  return addDaysStr(day, -((dow + 6) % 7));
}

/** Streaks from check-ins: current, best, and the recent record (true = done, false = missed). */
export function streakOf(cadence: string, doneDays: string[], today: string) {
  const done = new Set(doneDays.map((d) => periodOf(cadence, d)).filter((p): p is string => !!p));
  const step = cadence === "daily" ? 1 : 7;
  // Start from the current period; if it isn't done yet it doesn't break the streak.
  let p = periodOf(cadence, today) ?? periodOf(cadence, addDaysStr(today, -((dayOfWeek(today) + 1) % 7)))!;
  const recent: boolean[] = [];
  for (let i = 0; i < 8; i++) recent.push(done.has(addDaysStr(p, -step * i)));
  if (!done.has(p)) p = addDaysStr(p, -step);
  let current = 0;
  while (done.has(addDaysStr(p, -step * current))) current++;
  const sorted = [...done].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && addDaysStr(sorted[i - 1], step) === sorted[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best, recent };
}

export async function listHabits(scope: UserScope, today: string) {
  const [rows, checks] = [
    await scope.tx.select().from(habits).where(eq(habits.userId, scope.userId)).orderBy(desc(habits.active), habits.createdAt),
    await scope.tx
      .select()
      .from(habitChecks)
      .where(and(eq(habitChecks.userId, scope.userId), gte(habitChecks.day, addDaysStr(today, -400)))),
  ];
  return rows.map((h) => {
    const days = checks.filter((c) => c.habitId === h.id && c.done).map((c) => c.day);
    const s = streakOf(h.cadence, days, today);
    const period = periodOf(h.cadence, today);
    return { ...h, ...s, doneThisPeriod: !!period && days.some((d) => periodOf(h.cadence, d) === period), checkable: !!period };
  });
}
export type HabitWithStreak = Awaited<ReturnType<typeof listHabits>>[number];
