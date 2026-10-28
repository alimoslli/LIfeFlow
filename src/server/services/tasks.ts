import { and, asc, desc, eq, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, dayOfWeek, localDateOf, localTimeOf, localToInstant } from "@/lib/dates";
import { courses, projects, tasks, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound } from "./errors";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const WORK_STATUSES = ["todo", "in_progress", "done"] as const;

export const TASK_REPEATS = ["daily", "weekdays", "weekly", "biweekly", "monthly"] as const;
/** Reminder relative to the due time. */
export const REMINDERS = { none: null, at_time: 0, "15m": 15, "1h": 60, "1d": 1440 } as const;
export type ReminderKey = keyof typeof REMINDERS;

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give the to-do a title.").max(300, "To-do titles can be up to 300 characters."),
  notes: z.string().max(5000).nullish(),
  priority: z.enum(PRIORITIES).default("medium"),
  dueDate: z.string().regex(DATE_RE).nullish(),
  dueTime: z.string().regex(TIME_RE).nullish(),
  parentId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  repeat: z.enum(TASK_REPEATS).nullish(),
  reminder: z.enum(Object.keys(REMINDERS) as [ReminderKey, ...ReminderKey[]]).nullish(),
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

/** All-day to-dos remind at 9:00 local on the day (minus the offset). */
function remindAtFor(dueAt: Date | null, allDay: boolean, reminder: ReminderKey | null | undefined, tz: string): Date | null {
  const mins = reminder ? REMINDERS[reminder] : null;
  if (!dueAt || mins == null) return null;
  const base = allDay ? localToInstant(localDateOf(dueAt, tz), "09:00", tz) : dueAt;
  return new Date(base.getTime() - mins * 60_000);
}

/** The next due date for a repeating to-do. Pure. */
export function nextRepeatDate(date: string, repeat: (typeof TASK_REPEATS)[number]): string {
  switch (repeat) {
    case "daily":
      return addDaysStr(date, 1);
    case "weekdays": {
      let d = addDaysStr(date, 1);
      while (dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDaysStr(d, 1);
      return d;
    }
    case "weekly":
      return addDaysStr(date, 7);
    case "biweekly":
      return addDaysStr(date, 14);
    case "monthly": {
      const [y, m, day] = date.split("-").map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
      return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
    }
  }
}

/** Which reminder option a saved to-do uses (for edit forms). */
export function reminderKeyOf(t: { dueAt: Date | null; dueAllDay: boolean; remindAt: Date | null }, tz: string): ReminderKey {
  if (!t.dueAt || !t.remindAt) return "none";
  const base = t.dueAllDay ? localToInstant(localDateOf(t.dueAt, tz), "09:00", tz) : t.dueAt;
  const mins = Math.round((base.getTime() - t.remindAt.getTime()) / 60_000);
  return (Object.entries(REMINDERS).find(([, v]) => v === mins)?.[0] as ReminderKey) ?? "none";
}

export async function createTask(scope: UserScope, tz: string, input: TaskInput, source: DataSource = "manual", opts: { id?: string } = {}) {
  const data = taskInputSchema.parse(input);
  await assertOwned(scope, tasks, data.parentId, "Parent task");
  await assertOwned(scope, projects, data.projectId, "Project");
  await assertOwned(scope, courses, data.courseId, "Course");
  const due = dueFields(data.dueDate, data.dueTime, tz);
  const [row] = await scope.tx
    .insert(tasks)
    .values({
      ...(opts.id && { id: opts.id }),
      userId: scope.userId,
      title: data.title,
      notes: data.notes ?? null,
      priority: data.priority,
      parentId: data.parentId ?? null,
      projectId: data.projectId ?? null,
      courseId: data.courseId ?? null,
      source,
      ...due,
      repeat: data.repeat && data.dueDate ? data.repeat : null,
      remindAt: remindAtFor(due.dueAt, due.dueAllDay, data.reminder, tz),
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
  const [before] = await scope.tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)));
  if (!before) throw notFound("Task");
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (data.title !== undefined) set.title = data.title;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.priority !== undefined) set.priority = data.priority;
  if (data.projectId !== undefined) set.projectId = data.projectId;
  if (data.courseId !== undefined) set.courseId = data.courseId;
  if (data.dueDate !== undefined) Object.assign(set, dueFields(data.dueDate, data.dueTime, tz));
  if (data.repeat !== undefined) set.repeat = data.repeat ?? null;
  if (data.dueDate !== undefined || data.reminder !== undefined) {
    const dueAt = set.dueAt !== undefined ? set.dueAt : before.dueAt;
    const allDay = set.dueAllDay !== undefined ? set.dueAllDay : before.dueAllDay;
    const key = data.reminder !== undefined ? data.reminder : reminderKeyOf(before, tz);
    set.remindAt = remindAtFor(dueAt ?? null, allDay ?? false, key, tz);
    set.remindedAt = null;
  }
  if (data.status !== undefined) {
    set.status = data.status;
    set.completedAt = data.status === "done" ? new Date() : null;
  }
  const [row] = await scope.tx
    .update(tasks)
    .set(set)
    .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)))
    .returning();
  // Completing a repeating to-do schedules the next one (once).
  let next: typeof row | null = null;
  if (data.status === "done" && before.status !== "done" && row.repeat && row.dueAt) {
    const nextDate = nextRepeatDate(localDateOf(row.dueAt, tz), row.repeat);
    const offset = row.remindAt ? row.dueAt.getTime() - row.remindAt.getTime() : null;
    const due = dueFields(nextDate, row.dueAllDay ? null : localTimeOf(row.dueAt, tz), tz);
    [next] = await scope.tx
      .insert(tasks)
      .values({
        userId: scope.userId,
        title: row.title,
        notes: row.notes,
        priority: row.priority,
        projectId: row.projectId,
        courseId: row.courseId,
        repeat: row.repeat,
        source: row.source,
        ...due,
        remindAt: offset != null && due.dueAt ? new Date(due.dueAt.getTime() - offset) : null,
      })
      .returning();
  }
  return Object.assign(row, { next });
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
