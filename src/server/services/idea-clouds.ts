import { and, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { CLOUDS, pickClouds, type CloudFacts, type CloudKey, type IdeaCloud } from "@/lib/idea-clouds";
import type { UserScope } from "../db/with-user";
import {
  assignments,
  courses,
  employers,
  financialAccounts,
  healthSamples,
  personalGoals,
  promises,
  users,
  workShifts,
  type UserPreferences,
} from "../db/schema";
import { series } from "../db/series";
import { listEventsInRange } from "./calendar";

const one = <T>(rows: T[]) => rows.length > 0;

/** What the idea clouds may say for this person, from their own records only (lib/idea-clouds says why). */
export async function cloudFacts(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now = new Date()): Promise<CloudFacts> {
  const today = todayIn(tz, now);
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const open = and(eq(assignments.userId, scope.userId), isNull(assignments.completedAt), ne(assignments.status, "done"));
  const [me, classes, jobs, due, next, project, shifts, banks, health, goals, promised, todayEvents] = await series(
    () => scope.tx.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, scope.userId)),
    () =>
      scope.tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.userId, scope.userId), isNull(courses.archivedAt)))
        .limit(1),
    () => scope.tx.select({ id: employers.id }).from(employers).where(eq(employers.userId, scope.userId)).limit(1),
    () =>
      scope.tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(and(open, gt(assignments.dueAt, now), lte(assignments.dueAt, week)))
        .limit(1),
    () =>
      scope.tx
        .select({ title: assignments.title })
        .from(assignments)
        .where(and(open, gt(assignments.dueAt, now)))
        .orderBy(assignments.dueAt)
        .limit(1),
    () =>
      scope.tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(and(open, eq(assignments.kind, "project")))
        .limit(1),
    () =>
      scope.tx
        .select({ id: workShifts.id })
        .from(workShifts)
        .where(and(eq(workShifts.userId, scope.userId), gt(workShifts.startsAt, now)))
        .limit(1),
    () =>
      scope.tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(and(eq(financialAccounts.userId, scope.userId), isNull(financialAccounts.archivedAt)))
        .limit(1),
    () => scope.tx.select({ id: healthSamples.id }).from(healthSamples).where(eq(healthSamples.userId, scope.userId)).limit(1),
    () => scope.tx.select({ id: personalGoals.id }).from(personalGoals).where(eq(personalGoals.userId, scope.userId)).limit(1),
    () => scope.tx.select({ id: promises.id }).from(promises).where(eq(promises.userId, scope.userId)).limit(1),
    () => listEventsInRange(scope, tz, today, today),
  );
  const taps = prefs?.ideaTaps ?? {};
  const used: Partial<Record<CloudKey, boolean>> = Object.fromEntries(CLOUDS.map((c) => [c.key, (taps[c.key] ?? 0) > 0]));
  // features used through real records, not only through a cloud
  if (one(promised)) used.promise = true;
  if (one(goals)) used.goal = true;
  const stage = prefs?.lifeStage;
  return {
    student: one(classes) || stage === "student" || stage === "both",
    worker: one(jobs) || stage === "working" || stage === "both",
    dueSoon: one(due),
    project: one(project),
    shifts: one(shifts),
    classToday: todayEvents.some((e) => e.kind === "class" && e.startsAt > now),
    bank: one(banks),
    moneyLocked: !!prefs?.moneyLock?.enabled,
    health: one(health),
    nextAssignment: next[0]?.title,
    used,
    ageDays: me[0] ? Math.floor((now.getTime() - me[0].createdAt.getTime()) / 86_400_000) : 0,
  };
}

/** The person's local day number, so the clouds change from day to day in their time zone. */
export const localDay = (tz: string, now = new Date()) => Math.floor(Date.parse(`${todayIn(tz, now)}T00:00:00Z`) / 86_400_000);

/** The clouds for this person now (a few more than shown, so one can be swapped in now and then). */
export async function ideaClouds(scope: UserScope, tz: string, prefs: UserPreferences | undefined, name: string, now = new Date()): Promise<IdeaCloud[]> {
  return pickClouds(await cloudFacts(scope, tz, prefs, now), name, localDay(tz, now), 5);
}

/** A tapped cloud counts as used (a count only, never the message). Unknown keys are ignored. */
export async function recordCloudTap(scope: UserScope, key: string) {
  if (!CLOUDS.some((c) => c.key === key)) return;
  await scope.tx
    .update(users)
    .set({
      // one atomic update (two taps at once both count), creating ideaTaps on the first tap
      preferences: sql`${users.preferences} || jsonb_build_object('ideaTaps', coalesce(${users.preferences} -> 'ideaTaps', '{}'::jsonb) || jsonb_build_object(${key}::text, coalesce((${users.preferences} -> 'ideaTaps' ->> ${key}::text)::int, 0) + 1))`,
    })
    .where(eq(users.id, scope.userId));
}
