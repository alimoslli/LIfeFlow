import { and, desc, eq, getTableColumns, getTableName, inArray, lt } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  assignments,
  budgets,
  calendarEvents,
  courseMaterials,
  courses,
  financialGoals,
  goalContributions,
  notes,
  projects,
  tasks,
  transactions,
  trash,
  workShifts,
  type TrashKind,
} from "../db/schema";
import type { UserScope } from "../db/with-user";
import { notFound, ServiceError } from "./errors";

/**
 * One delete pattern for the whole app: deleting moves the item (and the
 * rows that belong to it) into the trash, where it can be restored for 30
 * days. Undo in the toast is the same restore.
 */

export const TRASH_DAYS = 30;

type Table = PgTable & { id: never; userId: never };
type Child = { table: Table; fk: string };
type Spec = { table: Table; label: (row: Record<string, unknown>) => string; children?: Child[]; guard?: (row: Record<string, unknown>) => string | null };

const T = <X>(t: X) => t as unknown as Table;

const SPECS: Record<TrashKind, Spec> = {
  task: { table: T(tasks), label: (r) => String(r.title), children: [{ table: T(tasks), fk: "parentId" }] },
  note: { table: T(notes), label: (r) => String(r.title || "Untitled note") },
  event: { table: T(calendarEvents), label: (r) => String(r.title) },
  assignment: { table: T(assignments), label: (r) => String(r.title) },
  shift: { table: T(workShifts), label: (r) => `Shift on ${new Date(String(r.startsAt)).toDateString()}` },
  transaction: {
    table: T(transactions),
    label: (r) => String(r.description),
    guard: (r) =>
      ["manual", "import", "jarvis", "demo"].includes(String(r.source)) ? null : "Bank-synced transactions can't be deleted. Hide it from totals instead.",
  },
  goal: { table: T(financialGoals), label: (r) => String(r.name), children: [{ table: T(goalContributions), fk: "goalId" }] },
  budget: { table: T(budgets), label: () => "Budget" },
  course: {
    table: T(courses),
    label: (r) => String(r.code ? `${r.code} ${r.name}` : r.name),
    children: [
      { table: T(assignments), fk: "courseId" },
      { table: T(courseMaterials), fk: "courseId" },
    ],
  },
  project: { table: T(projects), label: (r) => String(r.name) },
};

// Drizzle tables expose columns by JS name; this reads one generically.
const col = (table: Table, key: string) => (table as unknown as Record<string, Parameters<typeof eq>[0]>)[key];

/** Moves an item and its children to the trash. Returns the trash entry (for Undo). */
export async function moveToTrash(scope: UserScope, kind: TrashKind, id: string) {
  const spec = SPECS[kind];
  const [row] = (await scope.tx
    .select()
    .from(spec.table)
    .where(and(eq(col(spec.table, "id"), id), eq(col(spec.table, "userId"), scope.userId)))) as Record<string, unknown>[];
  if (!row) throw notFound(kind[0].toUpperCase() + kind.slice(1));
  const blocked = spec.guard?.(row);
  if (blocked) throw new ServiceError(blocked);
  const payload: Record<string, Record<string, unknown>[]> = { [getTableName(spec.table)]: [row] };
  for (const c of spec.children ?? []) {
    const rows = (await scope.tx
      .select()
      .from(c.table)
      .where(and(eq(col(c.table, c.fk), id), eq(col(c.table, "userId"), scope.userId)))) as Record<string, unknown>[];
    if (rows.length) payload[getTableName(c.table)] = [...(payload[getTableName(c.table)] ?? []), ...rows];
  }
  const label = spec.label(row).slice(0, 200);
  const [entry] = await scope.tx.insert(trash).values({ userId: scope.userId, kind, label, payload }).returning();
  await scope.tx.delete(spec.table).where(and(eq(col(spec.table, "id"), id), eq(col(spec.table, "userId"), scope.userId)));
  return { trashId: entry.id, kind, label };
}

/** JSON turns Dates into strings; turn them back for timestamp columns. */
function revive(table: Table, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(getTableColumns(table))) {
    if (!(key in row)) continue;
    const v = row[key];
    out[key] = c.dataType === "date" && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

const TABLES: Table[] = Object.values(SPECS).flatMap((s) => [s.table, ...(s.children ?? []).map((c) => c.table)]);

/** Puts everything back exactly as it was (same ids). */
export async function restoreFromTrash(scope: UserScope, trashId: string) {
  const [entry] = await scope.tx
    .select()
    .from(trash)
    .where(and(eq(trash.id, trashId), eq(trash.userId, scope.userId)));
  if (!entry) throw new ServiceError("That item is no longer in the trash.", "not_found");
  const spec = SPECS[entry.kind];
  // Parent first, then children; a task's subtasks live in the same table, so order rows parents-first.
  const order = [getTableName(spec.table), ...(spec.children ?? []).map((c) => getTableName(c.table))].filter((v, i, a) => a.indexOf(v) === i);
  for (const name of order) {
    const table = TABLES.find((t) => getTableName(t) === name)!;
    const rows = entry.payload[name] ?? [];
    for (const r of rows) {
      if (r.userId !== scope.userId) throw new ServiceError("This item can't be restored.");
      await scope.tx
        .insert(table)
        .values(revive(table, r) as never)
        .onConflictDoNothing();
    }
  }
  await scope.tx.delete(trash).where(eq(trash.id, entry.id));
  return { kind: entry.kind, label: entry.label };
}

export async function listTrash(scope: UserScope, now = new Date()) {
  // Anything older than 30 days is gone for good.
  await scope.tx.delete(trash).where(and(eq(trash.userId, scope.userId), lt(trash.deletedAt, new Date(now.getTime() - TRASH_DAYS * 86_400_000))));
  return scope.tx
    .select({ id: trash.id, kind: trash.kind, label: trash.label, deletedAt: trash.deletedAt })
    .from(trash)
    .where(eq(trash.userId, scope.userId))
    .orderBy(desc(trash.deletedAt));
}

export async function deleteForever(scope: UserScope, ids: string[]) {
  if (!ids.length) return 0;
  const r = await scope.tx
    .delete(trash)
    .where(and(eq(trash.userId, scope.userId), inArray(trash.id, ids)))
    .returning({ id: trash.id });
  return r.length;
}
