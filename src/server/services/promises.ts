import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, localDateOf, localTimeOf, localToInstant } from "@/lib/dates";
import { promises, tasks } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound, ServiceError } from "./errors";

export const PROMISE_CHECK_TIME = "21:00";
/** An unanswered check-in is dropped after this many days. It never counts as broken. */
export const STALE_DAYS = 7;
export const MAX_MOVES = 2;

export const promiseInput = z.object({
  text: z.string().trim().min(2, "Say what you'll do.").max(200, "Keep it to 200 characters."),
  dueDate: z.string().regex(DATE_RE).optional(),
  dueTime: z.string().regex(TIME_RE).optional(),
  taskId: z.string().uuid().optional(),
});
export type PromiseInput = z.input<typeof promiseInput>;

/** Saves what the user said they'd do, and when the assistant will check back (default: 9 PM that day, or tomorrow if that has passed). */
export async function createPromise(scope: UserScope, tz: string, input: PromiseInput, now = new Date()) {
  const d = promiseInput.parse(input);
  if (d.taskId) await assertOwned(scope, tasks, d.taskId, "To-do");
  const date = d.dueDate ?? localDateOf(now, tz);
  let dueAt = localToInstant(date, d.dueTime ?? PROMISE_CHECK_TIME, tz);
  if (!d.dueDate && dueAt.getTime() <= now.getTime() + 30 * 60_000) dueAt = localToInstant(addDaysStr(date, 1), d.dueTime ?? PROMISE_CHECK_TIME, tz);
  if (dueAt.getTime() <= now.getTime()) throw new ServiceError("That time has passed. Pick a later time.");
  // The same words already open: return it instead of a duplicate.
  const [dup] = await scope.tx
    .select()
    .from(promises)
    .where(and(eq(promises.userId, scope.userId), eq(promises.status, "open"), sql`lower(${promises.text}) = lower(${d.text})`));
  if (dup) return { promise: dup, created: false as const };
  const [row] = await scope.tx
    .insert(promises)
    .values({ userId: scope.userId, text: d.text, dueAt, taskId: d.taskId ?? null })
    .returning();
  return { promise: row, created: true as const };
}

export async function listPromises(scope: UserScope, status: "open" | "all" = "open", limit = 50) {
  return scope.tx
    .select()
    .from(promises)
    .where(and(eq(promises.userId, scope.userId), status === "open" ? eq(promises.status, "open") : undefined))
    .orderBy(asc(promises.dueAt))
    .limit(limit);
}

/** How the last stretch went: broken in 14 days drives the attitude, kept in 7 days the praise. */
export async function promiseStats(scope: UserScope, now = new Date()) {
  const rows = await scope.tx
    .select({ status: promises.status, resolvedAt: promises.resolvedAt })
    .from(promises)
    .where(
      and(eq(promises.userId, scope.userId), inArray(promises.status, ["kept", "broken"]), gte(promises.resolvedAt, new Date(now.getTime() - 14 * 86_400_000))),
    );
  const week = now.getTime() - 7 * 86_400_000;
  return {
    brokenRecent: rows.filter((r) => r.status === "broken").length,
    keptWeek: rows.filter((r) => r.status === "kept" && r.resolvedAt && r.resolvedAt.getTime() >= week).length,
  };
}

/** Marks a promise kept or broken. Only the user's own word or a finished to-do ever calls this. */
export async function resolvePromise(scope: UserScope, id: string, outcome: "kept" | "broken", by: "you" | "task", now = new Date()) {
  const [p] = await scope.tx
    .update(promises)
    .set({ status: outcome, resolvedAt: now, resolvedBy: by })
    .where(and(eq(promises.id, id), eq(promises.userId, scope.userId), eq(promises.status, "open")))
    .returning();
  if (!p) {
    const [any] = await scope.tx
      .select()
      .from(promises)
      .where(and(eq(promises.id, id), eq(promises.userId, scope.userId)));
    if (!any) throw notFound("Promise");
    return { promise: any, changed: false as const };
  }
  return { promise: p, changed: true as const };
}

/**
 * Removes an open promise that was saved by mistake (for example it was really a to-do). It is deleted, not marked: no check-in
 * ever fires for it and it never counts as kept or broken. Answered promises are history and stay.
 */
export async function cancelPromise(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(promises)
    .where(and(eq(promises.id, id), eq(promises.userId, scope.userId), eq(promises.status, "open")))
    .returning({ id: promises.id });
  if (!row) throw notFound("Promise");
  return { id: row.id };
}

/**
 * "Not yet": check again tomorrow (counted from now, in the user's time zone) at the same time of day, even if the card sat for days.
 * At most twice, so a promise can't be postponed forever.
 */
export async function movePromise(scope: UserScope, id: string, tz: string, now = new Date()) {
  const [p] = await scope.tx
    .select()
    .from(promises)
    .where(and(eq(promises.id, id), eq(promises.userId, scope.userId), eq(promises.status, "open")));
  if (!p) throw notFound("Promise");
  if (p.moves >= MAX_MOVES) throw new ServiceError("It's been moved twice already. Mark it done or let it go.");
  const [row] = await scope.tx
    .update(promises)
    .set({ dueAt: localToInstant(addDaysStr(localDateOf(now, tz), 1), localTimeOf(p.dueAt, tz), tz), moves: p.moves + 1 })
    .where(eq(promises.id, id))
    .returning();
  return row;
}

/** Drops promises nobody answered for a week (not broken: no answer isn't a "no"). */
export async function dropStalePromises(scope: UserScope, now = new Date()) {
  return scope.tx
    .update(promises)
    .set({ status: "dropped", resolvedAt: now, resolvedBy: "timeout" })
    .where(and(eq(promises.userId, scope.userId), eq(promises.status, "open"), lte(promises.dueAt, new Date(now.getTime() - STALE_DAYS * 86_400_000))))
    .returning({ id: promises.id });
}

/** Open promises tied to a to-do the user really finished: those are kept, no question asked. */
export async function keepFinishedTaskPromises(scope: UserScope, now = new Date()) {
  const rows = await scope.tx
    .select({ id: promises.id, text: promises.text })
    .from(promises)
    .innerJoin(tasks, eq(tasks.id, promises.taskId))
    .where(and(eq(promises.userId, scope.userId), eq(promises.status, "open"), eq(tasks.status, "done")));
  for (const r of rows) await resolvePromise(scope, r.id, "kept", "task", now);
  return rows;
}

/** Promises whose time has come and haven't been answered (and aren't stale). */
export async function promisesDue(scope: UserScope, now = new Date()) {
  return scope.tx
    .select()
    .from(promises)
    .where(
      and(
        eq(promises.userId, scope.userId),
        eq(promises.status, "open"),
        lte(promises.dueAt, now),
        gte(promises.dueAt, new Date(now.getTime() - STALE_DAYS * 86_400_000)),
      ),
    )
    .orderBy(asc(promises.dueAt));
}
