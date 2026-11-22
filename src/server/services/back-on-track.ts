import { and, asc, eq, isNotNull, lt, ne } from "drizzle-orm";
import { BACK_DAYS, BACK_MAX, BACK_MINUTES, spread } from "@/lib/back-on-track";
import { addDaysStr, localDateOf, todayIn } from "@/lib/dates";
import { tasks } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { busyAgenda, freeSlots } from "./calendar";

/**
 * Back on track (lib/back-on-track.ts): the to-dos whose time has passed (a day before today, or more than an hour ago),
 * oldest first, and where each fits in the free time of today and the next two days. Assignments are never moved: a
 * teacher's date stays the date. `late` counts every one; `moves` is what one tap would do (at most 5).
 */
export async function backOnTrackPlan(scope: UserScope, tz: string, now = new Date()) {
  const today = todayIn(tz, now);
  const rows = await scope.tx
    .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.userId, scope.userId), ne(tasks.status, "done"), isNotNull(tasks.dueAt), lt(tasks.dueAt, now)))
    .orderBy(asc(tasks.dueAt));
  const late = rows.filter((t) => localDateOf(t.dueAt!, tz) < today || t.dueAt!.getTime() < now.getTime() - 3600_000);
  if (!late.length) return { late: [] as typeof late, moves: [] as { taskId: string; title: string; at: Date }[] };
  const last = addDaysStr(today, BACK_DAYS - 1);
  const busy = await busyAgenda(scope, tz, today, last, { now });
  const days = Array.from({ length: BACK_DAYS }, (_, i) => addDaysStr(today, i)).map((d) =>
    freeSlots(busy, d, tz, "09:00", "21:00", BACK_MINUTES, d === today ? new Date(now.getTime() + 15 * 60_000) : undefined),
  );
  const moves = spread(late.slice(0, BACK_MAX), days).map(({ item, at }) => ({ taskId: item.id, title: item.title, at }));
  return { late, moves };
}
