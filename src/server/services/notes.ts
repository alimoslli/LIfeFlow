import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { courses, notes, projects, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound } from "./errors";

export const noteInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000).default(""),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  projectId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  pinned: z.boolean().default(false),
});

export async function createNote(scope: UserScope, input: z.input<typeof noteInputSchema>, source: DataSource = "manual") {
  const d = noteInputSchema.parse(input);
  await assertOwned(scope, projects, d.projectId, "Project");
  await assertOwned(scope, courses, d.courseId, "Course");
  const [row] = await scope.tx
    .insert(notes)
    .values({ ...d, userId: scope.userId, source })
    .returning();
  return row;
}

export async function updateNote(scope: UserScope, id: string, patch: Partial<z.input<typeof noteInputSchema>>) {
  const d = noteInputSchema.partial().parse(patch);
  await assertOwned(scope, projects, d.projectId, "Project");
  await assertOwned(scope, courses, d.courseId, "Course");
  const [row] = await scope.tx
    .update(notes)
    .set(d)
    .where(and(eq(notes.id, id), eq(notes.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Note");
  return row;
}

export async function deleteNote(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, scope.userId)))
    .returning({ id: notes.id, title: notes.title });
  if (!row) throw notFound("Note");
  return row;
}

export async function getNote(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, scope.userId)));
  if (!row) throw notFound("Note");
  return row;
}

/** Full-text search (title weighted above body), falling back to recency when no query. */
export async function searchNotes(scope: UserScope, opts: { query?: string; projectId?: string; courseId?: string; tag?: string; limit?: number } = {}) {
  const conds = [eq(notes.userId, scope.userId)];
  if (opts.projectId) conds.push(eq(notes.projectId, opts.projectId));
  if (opts.courseId) conds.push(eq(notes.courseId, opts.courseId));
  if (opts.tag) conds.push(sql`${opts.tag.toLowerCase()} = any(${notes.tags})`);
  const q = opts.query?.trim();
  const cols = {
    id: notes.id,
    title: notes.title,
    body: notes.body,
    tags: notes.tags,
    projectId: notes.projectId,
    courseId: notes.courseId,
    pinned: notes.pinned,
    updatedAt: notes.updatedAt,
    createdAt: notes.createdAt,
  };
  if (q) {
    const tsq = sql`websearch_to_tsquery('english', ${q})`;
    return scope.tx
      .select({ ...cols, rank: sql<number>`ts_rank(${notes.searchVector}, ${tsq})` })
      .from(notes)
      .where(and(...conds, sql`(${notes.searchVector} @@ ${tsq} or ${notes.title} ilike ${`%${q.replace(/[%_]/g, "")}%`})`))
      .orderBy(desc(sql`ts_rank(${notes.searchVector}, ${tsq})`), desc(notes.updatedAt))
      .limit(opts.limit ?? 50);
  }
  return scope.tx
    .select({ ...cols, rank: sql<number>`0` })
    .from(notes)
    .where(and(...conds))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt))
    .limit(opts.limit ?? 100);
}

// ---------------------------------------------------------------- projects

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
});

export async function createProject(scope: UserScope, input: z.input<typeof projectInputSchema>) {
  const d = projectInputSchema.parse(input);
  const [row] = await scope.tx
    .insert(projects)
    .values({ ...d, userId: scope.userId })
    .returning();
  return row;
}

export async function updateProject(scope: UserScope, id: string, patch: Partial<z.input<typeof projectInputSchema>>) {
  const d = projectInputSchema.partial().parse(patch);
  const [row] = await scope.tx
    .update(projects)
    .set(d)
    .where(and(eq(projects.id, id), eq(projects.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Project");
  return row;
}

export async function listProjects(scope: UserScope) {
  return scope.tx.select().from(projects).where(eq(projects.userId, scope.userId)).orderBy(asc(projects.status), asc(projects.name));
}

export async function getProject(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, scope.userId)));
  if (!row) throw notFound("Project");
  return row;
}
