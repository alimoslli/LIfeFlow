import { z } from "zod";
import { moveToTrash } from "../../services/trash";
import { localDateOf, localTimeOf } from "@/lib/dates";
import {
  ASSIGNMENT_KINDS,
  addMaterial,
  createCourse,
  getAssignment,
  importAssignments,
  listAssignments,
  listCourses,
  listMaterials,
  updateAssignment,
} from "../../services/school";
import { dateArg, defineTool, idArg, timeArg, type ToolContext } from "../tool";

function presentAssignment(
  a: {
    id: string;
    title: string;
    kind: string;
    status: string;
    dueAt: Date | null;
    dueAllDay: boolean;
    source: string;
    url: string | null;
    course: { id: string; name: string; code: string | null };
  },
  ctx: ToolContext,
) {
  return {
    id: a.id,
    title: a.title,
    course: a.course.code ? `${a.course.code} · ${a.course.name}` : a.course.name,
    courseId: a.course.id,
    kind: a.kind,
    status: a.status,
    due: a.dueAt ? (a.dueAllDay ? localDateOf(a.dueAt, ctx.tz) : `${localDateOf(a.dueAt, ctx.tz)} ${localTimeOf(a.dueAt, ctx.tz)}`) : null,
    source: a.source,
    url: a.url ?? undefined,
  };
}

export const schoolTools = [
  defineTool({
    name: "list_courses",
    description: "List the user's current courses (ids, codes, instructors, meeting info).",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listCourses(s));
      return {
        courses: rows.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          term: c.term,
          instructor: c.instructorName,
          meetingInfo: c.meetingInfo,
          location: c.location,
          source: c.source,
        })),
      };
    },
  }),
  defineTool({
    name: "create_course",
    description: "Create a course. Check list_courses first to avoid duplicates.",
    schema: z.object({
      name: z.string().min(1).max(200),
      code: z.string().max(40).optional(),
      term: z.string().max(60).optional(),
      instructorName: z.string().max(120).optional(),
      instructorEmail: z.string().email().optional(),
      meetingInfo: z.string().max(200).optional().describe('e.g. "Mon/Wed 10:00–11:15"'),
      location: z.string().max(200).optional(),
      url: z.string().url().optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const c = await ctx.run((s) => createCourse(s, a, "jarvis"));
      return { created: { id: c.id, name: c.name, code: c.code }, viewAt: `/school/courses/${c.id}` };
    },
  }),
  defineTool({
    name: "list_assignments",
    description: "List assignments/exams. view: today | week (rest of this week) | upcoming | overdue | completed | all.",
    schema: z.object({
      view: z.enum(["today", "week", "upcoming", "overdue", "completed", "all"]).optional(),
      courseId: idArg("Course").optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      const rows = await ctx.run((s) => listAssignments(s, ctx.tz, { view: a.view ?? "upcoming", courseId: a.courseId, limit: a.limit ?? 60, now: ctx.now }));
      return { view: a.view ?? "upcoming", count: rows.length, assignments: rows.map((r) => presentAssignment(r, ctx)) };
    },
  }),
  defineTool({
    name: "import_assignments",
    description:
      "Save assignments, exams, quizzes etc. as real records. Use this whenever the user shares assignment info (text, syllabus, screenshot). " +
      "Give each item a courseId (preferred) or courseName. Items whose course is unknown or ambiguous are NOT saved and come back in needsCourse — ask the user. " +
      "Duplicates (same course, title and due date) are skipped automatically. Only include dates you actually found; never invent due dates.",
    schema: z.object({
      items: z
        .array(
          z.object({
            title: z.string().min(1).max(300),
            courseId: idArg("Course").optional(),
            courseName: z.string().max(200).optional().describe("Course name or code as written in the source"),
            kind: z.enum(ASSIGNMENT_KINDS).optional(),
            dueDate: dateArg().optional(),
            dueTime: timeArg("Local due time HH:mm, only if stated").optional(),
            description: z.string().max(4000).optional(),
            pointsPossible: z.number().min(0).optional(),
            url: z.string().url().optional(),
            sourceRef: z.string().max(300).optional().describe('Where this came from, e.g. "syllabus screenshot"'),
          }),
        )
        .min(1)
        .max(100),
      createMissingCourses: z
        .boolean()
        .optional()
        .describe("Create a course when no existing course resembles courseName. Only if the user asked to add these courses."),
    }),
    mutates: true,
    async execute(a, ctx) {
      const outcome = await ctx.run((s) =>
        importAssignments(s, ctx.tz, a.items, { source: "jarvis", createMissingCourses: a.createMissingCourses, now: ctx.now }),
      );
      // Verify: read back what was saved so the reply reflects the database, not intent.
      const verified = await ctx.run(async (s) => {
        const ok: string[] = [];
        for (const c of outcome.created) {
          const row = await getAssignment(s, c.id).catch(() => null);
          if (row) ok.push(row.id);
        }
        return ok;
      });
      return {
        savedCount: outcome.created.length,
        verifiedInDatabase: verified.length,
        created: outcome.created.map((c) => ({
          id: c.id,
          title: c.title,
          course: c.course,
          due: c.dueAt ? `${localDateOf(c.dueAt, ctx.tz)} ${localTimeOf(c.dueAt, ctx.tz)}` : null,
        })),
        skippedDuplicates: outcome.duplicates,
        needsCourse: outcome.needsCourse,
        errors: outcome.errors,
        warnings: outcome.warnings,
        viewAt: "/school",
      };
    },
  }),
  defineTool({
    name: "update_assignment",
    description: "Update an assignment (status, due date, title...). Mark done with status 'done'.",
    schema: z.object({
      id: idArg("Assignment"),
      title: z.string().min(1).max(300).optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      kind: z.enum(ASSIGNMENT_KINDS).optional(),
      dueDate: dateArg().nullable().optional(),
      dueTime: timeArg().optional(),
      description: z.string().max(4000).nullable().optional(),
      grade: z.string().max(40).optional(),
    }),
    mutates: true,
    async execute({ id, ...patch }, ctx) {
      const updated = await ctx.run(async (s) => {
        await updateAssignment(s, ctx.tz, id, patch);
        return getAssignment(s, id);
      });
      return { updated: presentAssignment(updated, ctx) };
    },
  }),
  defineTool({
    name: "delete_assignment",
    description: "Delete an assignment. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Assignment") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const a = await ctx.run((s) => getAssignment(s, id));
      return `Delete "${a.title}" from ${a.course.name}?`;
    },
    async execute({ id }, ctx) {
      const t = await ctx.run((s) => moveToTrash(s, "assignment", id));
      return { deleted: t.label, restorableFromTrash: true };
    },
  }),
  defineTool({
    name: "course_materials",
    description: "List or add learning materials (links, pages, files) for a course.",
    schema: z.object({
      courseId: idArg("Course"),
      add: z.object({ title: z.string().min(1).max(300), url: z.string().url().optional(), module: z.string().max(120).optional() }).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        if (a.add) await addMaterial(s, { courseId: a.courseId, ...a.add }, "jarvis");
        const list = await listMaterials(s, a.courseId);
        return { added: !!a.add, materials: list.map((m) => ({ id: m.id, title: m.title, module: m.module, url: m.url })) };
      });
    },
  }),
];
