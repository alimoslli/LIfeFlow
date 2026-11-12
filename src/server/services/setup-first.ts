import { and, eq, inArray, isNull } from "drizzle-orm";
import { calendarEvents, courses, integrations, workShifts } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { ServiceError } from "./errors";

/**
 * Setup in the app (owner, 2026-11-12: "They have to have something on their calendar first"): setup can't finish until
 * one connection has really put something on their sky. That is read from the account's own rows, never from a flag the
 * browser sends: a connected Canvas, Google, Outlook or bank, or classes or shifts read from a picture and saved.
 */
export const FIRST_CONNECTION_NEEDED = "Connect one thing first, so your sky has your week on it.";

export type FirstConnection = "canvas" | "google" | "outlook" | "bank" | "classes" | "shifts" | "plans";

const LINKED: Record<string, FirstConnection> = { canvas: "canvas", google: "google", outlook: "outlook", plaid: "bank" };

export async function firstConnection(scope: UserScope): Promise<FirstConnection | null> {
  const [links, classes, shifts, plans] = await series(
    () =>
      scope.tx
        .select({ provider: integrations.provider })
        .from(integrations)
        .where(
          and(eq(integrations.userId, scope.userId), eq(integrations.status, "connected"), inArray(integrations.provider, Object.keys(LINKED) as never[])),
        ),
    () =>
      scope.tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.userId, scope.userId), isNull(courses.archivedAt)))
        .limit(1),
    () => scope.tx.select({ id: workShifts.id }).from(workShifts).where(eq(workShifts.userId, scope.userId)).limit(1),
    () => scope.tx.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.userId, scope.userId)).limit(1),
  );
  if (links.length) return LINKED[links[0].provider];
  if (classes.length) return "classes";
  if (shifts.length) return "shifts";
  if (plans.length) return "plans";
  return null;
}

export async function requireFirstConnection(scope: UserScope) {
  const got = await firstConnection(scope);
  if (!got) throw new ServiceError(FIRST_CONNECTION_NEEDED);
  return got;
}
