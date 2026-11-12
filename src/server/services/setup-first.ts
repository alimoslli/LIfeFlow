import { and, eq, isNull } from "drizzle-orm";
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem } from "@/lib/birthday";
import { todayIn } from "@/lib/dates";
import { calendarEvents, courses, financialAccounts, users, workShifts } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "./errors";
import { finishOnboarding } from "./onboarding";

/**
 * Setup in the app (owner, 2026-11-12: "They have to have something on their calendar first"): setup can't finish until one
 * thing has really put something on their sky. That is read from the account's own saved rows, never from a flag the browser
 * sends and never from a bare connection: a Canvas, Google or Outlook link counts only through a row it brought (a class, a
 * due date, an event), the bank only through a linked account, and the person's own classes, shifts or plans (from a picture,
 * a typed message or a spoken one) count as they are saved. Nothing saved means setup waits.
 */
export const FIRST_CONNECTION_NEEDED = "Connect one thing first, so your sky has your week on it.";

export type FirstConnection = "canvas" | "google" | "outlook" | "bank" | "classes" | "shifts" | "plans";

export async function firstConnection(scope: UserScope): Promise<FirstConnection | null> {
  const [classes, events, shifts, banks] = await series(
    () =>
      scope.tx
        .select({ source: courses.source })
        .from(courses)
        .where(and(eq(courses.userId, scope.userId), isNull(courses.archivedAt)))
        .limit(20),
    () => scope.tx.select({ source: calendarEvents.source }).from(calendarEvents).where(eq(calendarEvents.userId, scope.userId)).limit(20),
    () => scope.tx.select({ id: workShifts.id }).from(workShifts).where(eq(workShifts.userId, scope.userId)).limit(1),
    () =>
      scope.tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(and(eq(financialAccounts.userId, scope.userId), eq(financialAccounts.source, "plaid"), isNull(financialAccounts.archivedAt)))
        .limit(1),
  );
  const from = (s: string) => events.some((e) => e.source === s);
  if (classes.some((c) => c.source === "canvas") || from("canvas")) return "canvas";
  if (from("google")) return "google";
  if (from("outlook")) return "outlook";
  if (banks.length) return "bank";
  if (classes.length) return "classes";
  if (shifts.length) return "shifts";
  if (events.length) return "plans";
  return null;
}

export async function requireFirstConnection(scope: UserScope) {
  const got = await firstConnection(scope);
  if (!got) throw new ServiceError(FIRST_CONNECTION_NEEDED);
  return got;
}

/**
 * The one way setup finishes (Today's "Go to my sky", the old welcome's Skip and its finish): not under 13, a real birthday
 * (checked first, so that is the question asked when it's missing), then one real thing on the sky, then `finishOnboarding`.
 */
export async function finishSetup(scope: UserScope, tz: string, prefs: Parameters<typeof finishOnboarding>[1] = {}) {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  if (u.preferences.ageBlockedAt) throw new ServiceError(AGE_LINE);
  if (!u.preferences.birthDate || birthDateProblem(u.preferences.birthDate, todayIn(tz))) throw new ServiceError(BIRTHDAY_NEEDED);
  await requireFirstConnection(scope);
  await finishOnboarding(scope, prefs, tz);
}
