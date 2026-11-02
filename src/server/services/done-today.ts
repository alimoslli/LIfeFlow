import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { startOfLocalDay, type DateStr } from "@/lib/dates";
import { assignments, tasks } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";

export type DoneItem = { kind: "task" | "assignment"; id: string; title: string; href: string };

/** To-dos and assignments ticked off since the start of the user's day, newest first. */
export async function doneToday(scope: UserScope, today: DateStr, tz: string): Promise<DoneItem[]> {
  const since = startOfLocalDay(today, tz);
  const [t, a] = await series(
    () =>
      scope.tx
        .select({ id: tasks.id, title: tasks.title, at: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.userId, scope.userId), eq(tasks.status, "done"), isNull(tasks.parentId), gte(tasks.completedAt, since)))
        .orderBy(desc(tasks.completedAt))
        .limit(20),
    () =>
      scope.tx
        .select({ id: assignments.id, title: assignments.title, courseId: assignments.courseId, at: assignments.completedAt })
        .from(assignments)
        .where(and(eq(assignments.userId, scope.userId), eq(assignments.status, "done"), gte(assignments.completedAt, since)))
        .orderBy(desc(assignments.completedAt))
        .limit(20),
  );
  return [
    ...t.map((r) => ({ kind: "task" as const, id: r.id, title: r.title, href: `/tasks/${r.id}`, at: r.at })),
    ...a.map((r) => ({ kind: "assignment" as const, id: r.id, title: r.title, href: `/school/courses/${r.courseId}`, at: r.at })),
  ]
    .sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0))
    .map(({ at: _at, ...item }) => item);
}
