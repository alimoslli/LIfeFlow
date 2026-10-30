import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { courseGrade } from "@/lib/grades";
import { DATE_RE, TIME_RE, addDaysStr, localDateOf, localToInstant, startOfLocalDay, todayIn, weekStart } from "@/lib/dates";
import { normalizeText } from "@/lib/utils";
import { assignments, courseMaterials, courses, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound, ServiceError } from "./errors";
import { parsePatch } from "./patch";

export const ASSIGNMENT_KINDS = ["assignment", "exam", "quiz", "project", "reading", "lab", "discussion", "other"] as const;

// ---------------------------------------------------------------- courses

export const courseInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(40).nullish(),
  term: z.string().trim().max(60).nullish(),
  instructorName: z.string().trim().max(120).nullish(),
  instructorEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .nullish()
    .or(z.literal("").transform(() => null)),
  location: z.string().trim().max(200).nullish(),
  meetingInfo: z.string().trim().max(200).nullish(),
  gradeWeights: z.record(z.string(), z.number().min(0).max(100)).nullish(),
  url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .nullish()
    .or(z.literal("").transform(() => null)),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullish(),
});

const COURSE_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];

export async function createCourse(scope: UserScope, input: z.input<typeof courseInputSchema>, source: DataSource = "manual") {
  const data = courseInputSchema.parse(input);
  const count = await scope.tx.$count(courses, eq(courses.userId, scope.userId));
  const [row] = await scope.tx
    .insert(courses)
    .values({ ...data, userId: scope.userId, source, color: data.color ?? COURSE_COLORS[count % COURSE_COLORS.length] })
    .returning();
  return row;
}

export async function updateCourse(scope: UserScope, id: string, patch: Partial<z.input<typeof courseInputSchema>>) {
  const data = parsePatch(courseInputSchema.partial(), patch);
  const [row] = await scope.tx
    .update(courses)
    .set(data)
    .where(and(eq(courses.id, id), eq(courses.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Course");
  return row;
}

export async function deleteCourse(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(courses)
    .where(and(eq(courses.id, id), eq(courses.userId, scope.userId)))
    .returning({ id: courses.id, name: courses.name });
  if (!row) throw notFound("Course");
  return row;
}

export async function listCourses(scope: UserScope, opts: { includeArchived?: boolean } = {}) {
  const conds = [eq(courses.userId, scope.userId)];
  if (!opts.includeArchived) conds.push(isNull(courses.archivedAt));
  return scope.tx
    .select()
    .from(courses)
    .where(and(...conds))
    .orderBy(asc(courses.name));
}

export async function getCourse(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.userId, scope.userId)));
  if (!row) throw notFound("Course");
  return row;
}

type CourseLike = { id: string; name: string; code: string | null };

/**
 * Scores how well a free-text reference ("bio 101", "Biology", "BIO-101 Intro")
 * matches a course. 1 = exact code/name, 0 = no match.
 */
export function scoreCourseMatch(query: string, course: CourseLike): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const name = normalizeText(course.name);
  const code = course.code ? normalizeText(course.code) : "";
  const compact = (s: string) => s.replace(/\s+/g, "");
  if (q === name || (code && compact(q) === compact(code))) return 1;
  if (code && compact(q).includes(compact(code))) return 0.9;
  if (name.includes(q) || q.includes(name)) return 0.8;
  const qTokens = new Set(q.split(" ").filter((t) => t.length > 1));
  const cTokens = new Set(`${name} ${code}`.split(" ").filter((t) => t.length > 1));
  if (!qTokens.size || !cTokens.size) return 0;
  let overlap = 0;
  for (const t of qTokens) if (cTokens.has(t)) overlap++;
  return (0.7 * overlap) / Math.max(qTokens.size, 1);
}

export function matchCourses<T extends CourseLike>(query: string, list: T[]) {
  return list
    .map((course) => ({ course, score: scoreCourseMatch(query, course) }))
    .filter((m) => m.score >= 0.35)
    .sort((a, b) => b.score - a.score);
}

/** Returns a single confident match, or null with candidates when ambiguous/absent. */
export async function resolveCourse(scope: UserScope, ref: { courseId?: string | null; courseName?: string | null }) {
  const all = await listCourses(scope);
  if (ref.courseId) {
    const c = all.find((x) => x.id === ref.courseId);
    return c ? { course: c, candidates: [] } : { course: null, candidates: [] };
  }
  if (!ref.courseName) return { course: null, candidates: [] };
  const matches = matchCourses(ref.courseName, all);
  const [best, second] = matches;
  // Confident only when the best match clearly beats the runner-up; ties are ambiguous.
  if (best && best.score >= 0.5 && (!second || best.score - second.score >= 0.15)) {
    return { course: best.course, candidates: [] };
  }
  return { course: null, candidates: matches.slice(0, 5).map((m) => m.course) };
}

// ---------------------------------------------------------------- assignments

export const assignmentInputSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).nullish(),
  kind: z.enum(ASSIGNMENT_KINDS).default("assignment"),
  dueDate: z.string().regex(DATE_RE).nullish(),
  dueTime: z.string().regex(TIME_RE).nullish(),
  pointsPossible: z.number().min(0).max(100_000).nullish(),
  url: z
    .string()
    .url()
    .max(2000)
    .nullish()
    .or(z.literal("").transform(() => null)),
  sourceRef: z.string().max(300).nullish(),
});
export type AssignmentInput = z.input<typeof assignmentInputSchema>;

export function assignmentDedupeKey(courseId: string, title: string, localDueDate: string | null | undefined) {
  return `${courseId}|${normalizeText(title)}|${localDueDate ?? "nodate"}`;
}

type CreateResult = { status: "created"; assignment: typeof assignments.$inferSelect } | { status: "duplicate"; assignment: typeof assignments.$inferSelect };

export async function createAssignment(scope: UserScope, tz: string, input: AssignmentInput, source: DataSource = "manual"): Promise<CreateResult> {
  const data = assignmentInputSchema.parse(input);
  await assertOwned(scope, courses, data.courseId, "Course");
  if (data.dueTime && !data.dueDate) throw new ServiceError("A due time needs a due date.");
  const dedupeKey = assignmentDedupeKey(data.courseId, data.title, data.dueDate);
  const [row] = await scope.tx
    .insert(assignments)
    .values({
      userId: scope.userId,
      courseId: data.courseId,
      title: data.title,
      description: data.description ?? null,
      kind: data.kind,
      dueAt: data.dueDate ? localToInstant(data.dueDate, data.dueTime, tz) : null,
      dueAllDay: !!data.dueDate && !data.dueTime,
      pointsPossible: data.pointsPossible != null ? String(data.pointsPossible) : null,
      url: data.url ?? null,
      source,
      sourceRef: data.sourceRef ?? null,
      dedupeKey,
    })
    .onConflictDoNothing({ target: [assignments.userId, assignments.dedupeKey] })
    .returning();
  if (row) return { status: "created", assignment: row };
  const [existing] = await scope.tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.dedupeKey, dedupeKey)));
  return { status: "duplicate", assignment: existing };
}

export const assignmentPatchSchema = assignmentInputSchema
  .omit({ courseId: true })
  .partial()
  .extend({ status: z.enum(["todo", "in_progress", "done"]).optional(), grade: z.string().max(40).nullish() });

export async function updateAssignment(scope: UserScope, tz: string, id: string, patch: z.input<typeof assignmentPatchSchema>) {
  const data = parsePatch(assignmentPatchSchema, patch);
  const [current] = await scope.tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, id), eq(assignments.userId, scope.userId)));
  if (!current) throw notFound("Assignment");
  const set: Partial<typeof assignments.$inferInsert> = {};
  if (data.title !== undefined) set.title = data.title;
  if (data.description !== undefined) set.description = data.description;
  if (data.kind !== undefined) set.kind = data.kind;
  if (data.url !== undefined) set.url = data.url;
  if (data.grade !== undefined) set.grade = data.grade;
  if (data.pointsPossible !== undefined) set.pointsPossible = data.pointsPossible == null ? null : String(data.pointsPossible);
  if (data.dueDate !== undefined) {
    set.dueAt = data.dueDate ? localToInstant(data.dueDate, data.dueTime, tz) : null;
    set.dueAllDay = !!data.dueDate && !data.dueTime;
  }
  if (data.status !== undefined) {
    set.status = data.status;
    set.completedAt = data.status === "done" ? new Date() : null;
  }
  const dueAt = set.dueAt !== undefined ? set.dueAt : current.dueAt;
  set.dedupeKey = assignmentDedupeKey(current.courseId, set.title ?? current.title, dueAt ? localDateOf(dueAt, tz) : null);
  const [row] = await scope.tx
    .update(assignments)
    .set(set)
    .where(and(eq(assignments.id, id), eq(assignments.userId, scope.userId)))
    .returning();
  return row;
}

export async function deleteAssignment(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(assignments)
    .where(and(eq(assignments.id, id), eq(assignments.userId, scope.userId)))
    .returning({ id: assignments.id, title: assignments.title });
  if (!row) throw notFound("Assignment");
  return row;
}

export type AssignmentView = "today" | "week" | "upcoming" | "overdue" | "completed" | "all";

export async function listAssignments(scope: UserScope, tz: string, opts: { view?: AssignmentView; courseId?: string; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const today = todayIn(tz, now);
  const startToday = startOfLocalDay(today, tz);
  const startTomorrow = startOfLocalDay(addDaysStr(today, 1), tz);
  const endOfWeek = startOfLocalDay(addDaysStr(weekStart(today), 7), tz);
  const conds = [eq(assignments.userId, scope.userId)];
  if (opts.courseId) conds.push(eq(assignments.courseId, opts.courseId));
  const view = opts.view ?? "all";
  const open = ne(assignments.status, "done");
  if (view === "today") conds.push(open, gte(assignments.dueAt, startToday), lt(assignments.dueAt, startTomorrow));
  if (view === "week") conds.push(open, gte(assignments.dueAt, startToday), lt(assignments.dueAt, endOfWeek));
  if (view === "upcoming") conds.push(open, gte(assignments.dueAt, now));
  if (view === "overdue") conds.push(open, lt(assignments.dueAt, now));
  if (view === "completed") conds.push(eq(assignments.status, "done"));
  const rows = await scope.tx
    .select({ assignment: assignments, course: { id: courses.id, name: courses.name, code: courses.code, color: courses.color } })
    .from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(and(...conds))
    .orderBy(view === "completed" ? desc(assignments.completedAt) : sql`${assignments.dueAt} asc nulls last`, asc(assignments.title))
    .limit(opts.limit ?? 300);
  return rows.map((r) => ({ ...r.assignment, course: r.course }));
}

export async function getAssignment(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select({ assignment: assignments, course: { id: courses.id, name: courses.name, code: courses.code, color: courses.color } })
    .from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(and(eq(assignments.id, id), eq(assignments.userId, scope.userId)));
  if (!row) throw notFound("Assignment");
  return { ...row.assignment, course: row.course };
}

// ---------------------------------------------------------------- bulk import

export const importItemSchema = assignmentInputSchema.omit({ courseId: true }).extend({
  courseId: z.string().uuid().nullish(),
  courseName: z.string().max(200).nullish(),
});
export type ImportItem = z.input<typeof importItemSchema>;

export type ImportOutcome = {
  created: { id: string; title: string; course: string; dueAt: Date | null }[];
  duplicates: { id: string; title: string; course: string }[];
  needsCourse: { title: string; courseName: string | null; candidates: { id: string; name: string; code: string | null }[] }[];
  errors: { title: string; error: string }[];
  warnings: string[];
};

/**
 * Imports many assignments at once (from Jarvis, a syllabus, a CSV...).
 * Never guesses a course: unmatched or ambiguous items are returned in
 * `needsCourse` so the user can choose. Duplicates are skipped, not doubled.
 */
export async function importAssignments(
  scope: UserScope,
  tz: string,
  items: ImportItem[],
  opts: { source?: DataSource; createMissingCourses?: boolean; now?: Date } = {},
): Promise<ImportOutcome> {
  const out: ImportOutcome = { created: [], duplicates: [], needsCourse: [], errors: [], warnings: [] };
  const today = todayIn(tz, opts.now ?? new Date());
  for (const raw of items) {
    const parsed = importItemSchema.safeParse(raw);
    if (!parsed.success) {
      out.errors.push({ title: String((raw as { title?: unknown }).title ?? "(untitled)"), error: parsed.error.issues[0]?.message ?? "invalid" });
      continue;
    }
    const item = parsed.data;
    const resolved = await resolveCourse(scope, item);
    let course = resolved.course;
    const candidates = resolved.candidates;
    if (!course && opts.createMissingCourses && item.courseName && candidates.length === 0) {
      course = await createCourse(scope, { name: item.courseName }, opts.source ?? "manual");
      out.warnings.push(`Created new course "${course.name}".`);
    }
    if (!course) {
      out.needsCourse.push({
        title: item.title,
        courseName: item.courseName ?? null,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name, code: c.code })),
      });
      continue;
    }
    if (item.dueDate && item.dueDate < addDaysStr(today, -30)) {
      out.warnings.push(`"${item.title}" is due ${item.dueDate}, more than 30 days ago. Check the year.`);
    }
    try {
      const res = await createAssignment(scope, tz, { ...item, courseId: course.id }, opts.source ?? "manual");
      const summary = { id: res.assignment.id, title: res.assignment.title, course: course.name };
      if (res.status === "created") out.created.push({ ...summary, dueAt: res.assignment.dueAt });
      else out.duplicates.push(summary);
    } catch (e) {
      out.errors.push({ title: item.title, error: e instanceof Error ? e.message : "failed" });
    }
  }
  return out;
}

// ---------------------------------------------------------------- materials

export const materialInputSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  module: z.string().trim().max(120).nullish(),
  kind: z.enum(["link", "file", "page", "video", "other"]).default("link"),
  url: z.string().url().max(2000).nullish(),
});

export async function addMaterial(scope: UserScope, input: z.input<typeof materialInputSchema>, source: DataSource = "manual") {
  const data = materialInputSchema.parse(input);
  await assertOwned(scope, courses, data.courseId, "Course");
  const [row] = await scope.tx
    .insert(courseMaterials)
    .values({ ...data, userId: scope.userId, source })
    .returning();
  return row;
}

export async function listMaterials(scope: UserScope, courseId: string) {
  return scope.tx
    .select()
    .from(courseMaterials)
    .where(and(eq(courseMaterials.userId, scope.userId), eq(courseMaterials.courseId, courseId)))
    .orderBy(asc(courseMaterials.module), asc(courseMaterials.title));
}

export async function deleteMaterial(scope: UserScope, id: string) {
  await scope.tx.delete(courseMaterials).where(and(eq(courseMaterials.id, id), eq(courseMaterials.userId, scope.userId)));
}

/** The class's current grade from graded work (and its weights, if set). Null when nothing is graded yet. */
export async function courseGradeReport(scope: UserScope, tz: string, courseId: string) {
  const course = await getCourse(scope, courseId);
  const all = await listAssignments(scope, tz, { courseId, view: "all" });
  const grade = courseGrade(
    all.map((a) => ({ kind: a.kind, grade: a.grade, pointsPossible: a.pointsPossible == null ? null : Number(a.pointsPossible) })),
    course.gradeWeights,
  );
  return { course: { id: course.id, name: course.name }, weights: course.gradeWeights ?? null, grade };
}
