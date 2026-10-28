import { and, asc, desc, eq, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, localToInstant } from "@/lib/dates";
import { courses, projects, tasks, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound } from "./errors";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const WORK_STATUSES = ["todo", "in_progress", "done"] as const;

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(5000).nullish(),
  priority: z.enum(PRIORITIES).default("medium"),
  dueDate: z.string().regex(DATE_RE).nullish(),
  dueTime: z.string().regex(TIME_RE).nullish(),
  parentId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
});
export type TaskInput = z.input<typeof taskInputSchema>;

export const taskPatchSchema = taskInputSchema
  .omit({ parentId: true })
  .partial()
  .extend({ status: z.enum(WORK_STATUSES).optional() });

function dueFields(dueDate: string | null | undefined, dueTime: string | null | undefined, tz: string) {
  if (!dueDate) return { dueAt: null, dueAllDay: false };
  return { dueAt: localToInstant(dueDate, dueTime, tz), dueAllDay: !dueTime };
}

export async function createTask(scope: UserScope, tz: string, input: TaskInput, source: DataSource = "manual") {
  const data = taskInputSchema.parse(input);
  await assertOwned(scope, tasks, data.parentId, "Parent task");
  await assertOwned(scope, projects, data.projectId, "Project");
  await assertOwned(scope, courses, data.courseId, "Course");
  const [row] = await scope.tx
    .insert(tasks)
    .values({
      userId: scope.userId,
      title: data.title,
      notes: data.notes ?? null,
      priority: data.priority,
      parentId: data.parentId ?? null,
      projectId: data.projectId ?? null,
      courseId: data.courseId ?? null,
      source,
      ...dueFields(data.dueDate, data.dueTime, tz),
    })
    .returning();
  return row;
}

export async function getTask(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)));
  if (!row) throw notFound("Task");
  const subtasks = await scope.tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentId, id), eq(tasks.userId, scope.userId)))
    .orderBy(asc(tasks.createdAt));
  return { ...row, subtasks };
}

export async function updateTask(scope: UserScope, tz: string, id: string, patch: z.input<typeof taskPatchSchema>) {
  const data = taskPatchSchema.parse(patch);
  await assertOwned(scope, projects, data.projectId, "Project");
  await assertOwned(scope, courses, data.courseId, "Course");
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (data.title !== undefined) set.title = data.title;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.priority !== undefined) set.priority = data.priority;
  if (data.projectId !== undefined) set.projectId = data.projectId;
  if (data.courseId !== undefined) set.courseId = data.courseId;
  if (data.dueDate !== undefined) Object.assign(set, dueFields(data.dueDate, data.dueTime, tz));
  if (data.status !== undefined) {
    set.status = data.status;
    set.completedAt = data.status === "done" ? new Date() : null;
  }
  const [row] = await scope.tx
    .update(tasks)
    .set(set)
    .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Task");
  return row;
}

export const setTaskStatus = (scope: UserScope, id: string, status: (typeof WORK_STATUSES)[number]) => updateTask(scope, "UTC", id, { status });

export async function deleteTask(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)))
    .returning({ id: tasks.id, title: tasks.title });
  if (!row) throw notFound("Task");
  return row;
}

export type TaskFilter = {
  status?: "open" | "done" | "all";
  dueBefore?: Date;
  courseId?: string;
  projectId?: string;
  search?: string;
  topLevelOnly?: boolean;
  limit?: number;
};

export async function listTasks(scope: UserScope, filter: TaskFilter = {}) {
  const conds = [eq(tasks.userId, scope.userId)];
  const status = filter.status ?? "open";
  if (status === "open") conds.push(ne(tasks.status, "done"));
  if (status === "done") conds.push(eq(tasks.status, "done"));
  if (filter.dueBefore) conds.push(lte(tasks.dueAt, filter.dueBefore));
  if (filter.courseId) conds.push(eq(tasks.courseId, filter.courseId));
  if (filter.projectId) conds.push(eq(tasks.projectId, filter.projectId));
  if (filter.topLevelOnly) conds.push(isNull(tasks.parentId));
  if (filter.search) {
    const q = `%${filter.search.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(tasks.title, q), ilike(tasks.notes, q))!);
  }
  const priorityRank = sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;
  return scope.tx
    .select()
    .from(tasks)
    .where(and(...conds))
    .orderBy(status === "done" ? desc(tasks.completedAt) : sql`${tasks.dueAt} asc nulls last`, priorityRank, asc(tasks.createdAt))
    .limit(filter.limit ?? 200);
}

/** Subtask counts per parent, for list views. */
export async function subtaskCounts(scope: UserScope, parentIds: string[]) {
  if (!parentIds.length) return new Map<string, { total: number; done: number }>();
  const rows = await scope.tx
    .select({
      parentId: tasks.parentId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, scope.userId), inArray(tasks.parentId, parentIds)))
    .groupBy(tasks.parentId);
  return new Map(rows.map((r) => [r.parentId!, { total: r.total, done: r.done }]));
}
