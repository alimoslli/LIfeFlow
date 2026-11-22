import { and, eq, gte, like } from "drizzle-orm";
import { addDaysStr, startOfLocalDay, todayIn } from "@/lib/dates";
import { pickMoment, type MomentAnswer, type MomentQuestion, type MomentStar } from "@/lib/moment-question";
import { jarvisMessages, users } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";

/**
 * The skyling's question on a real moment (owner, 2026-11-22; lib/moment-question.ts): when the stars just claimed include
 * a shift, a class or an exam, one specific question about it, at most one question a day (this one or a get-to-know
 * question), marked asked in the same transaction so another device or a reload never asks again.
 */
export async function momentAfterStars(scope: UserScope, tz: string, stars: MomentStar[], now = new Date()): Promise<MomentQuestion | null> {
  const q = pickMoment(stars);
  if (!q) return null;
  const today = todayIn(tz, now);
  const [[u], asked] = await series(
    () => scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update"),
    () =>
      scope.tx
        .select({ id: jarvisMessages.id })
        .from(jarvisMessages)
        .where(
          and(eq(jarvisMessages.userId, scope.userId), like(jarvisMessages.dedupeKey, "question:%"), gte(jarvisMessages.createdAt, startOfLocalDay(today, tz))),
        )
        .limit(1),
  );
  if (u.preferences.askedOn === today || asked.length) return null;
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, askedOn: today } })
    .where(eq(users.id, scope.userId));
  return q;
}

/**
 * The answer. Nothing about the feeling is stored; "Rough" keeps the rest of the day quiet (`easyUntil`, the end of their
 * local day), which the proactive engine reads (QUIET_ON_EASY_DAYS).
 */
export async function answerMoment(scope: UserScope, tz: string, answer: MomentAnswer, now = new Date()) {
  if (answer !== "Rough") return;
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update");
  const end = startOfLocalDay(addDaysStr(todayIn(tz, now), 1), tz).toISOString();
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, easyUntil: end } })
    .where(eq(users.id, scope.userId));
}

/** True while a rough day is still being kept quiet. */
export const easyDay = (prefs: { easyUntil?: string } | undefined, now: Date) => !!prefs?.easyUntil && Date.parse(prefs.easyUntil) > now.getTime();
