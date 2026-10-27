import { z } from "zod";
import { localDateOf, localTimeOf, startOfLocalDay, addDaysStr } from "@/lib/dates";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "../../services/tasks";
import { createProject, listProjects } from "../../services/notes";
import { dateArg, defineTool, idArg, timeArg, type ToolContext } from "../tool";

const priority = z.enum(["low", "medium", "high", "urgent"]);

export function presentTask(t: { id: string; title: string; status: string; priority: string; dueAt: Date | null; dueAllDay: boolean; notes?: string | null; parentId?: string | null; courseId?: string | null; projectId?: string | null }, ctx: ToolContext) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.dueAt ? (t.dueAllDay ? localDateOf(t.dueAt, ctx.tz) : `${localDateOf(t.dueAt, ctx.tz)} ${localTimeOf(t.dueAt, ctx.tz)}`) : null,
    notes: t.notes ?? undefined,
    parentId: t.parentId ?? undefined,
    courseId: t.courseId ?? undefined,
    projectId: t.projectId ?? undefined,
  };
}

const newTask = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(5000).optional(),
  priority: priority.optional(),
  dueDate: dateArg().optional(),
  dueTime: timeArg().optional(),
  courseId: idArg("Course").optional(),
  projectId: idArg("Project").optional(),
  parentId: idArg("Parent task (makes this a subtask)").optional(),
  subtasks: z.array(z.string().min(1).max(300)).max(30).optional().describe("Titles of subtasks to create under this task"),
});

export const taskTools = [
  defineTool({
    name: "list_tasks",
    description: "List the user's tasks. Defaults to open tasks sorted by due date then priority.",
    schema: z.object({
      status: z.enum(["open", "done", "all"]).optional(),
      dueBy: dateArg("Only tasks due on or before this local date").optional(),
      search: z.string().max(100).optional(),
      courseId: idArg("Course").optional(),
      projectId: idArg("Project").optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      const rows = await ctx.run((s) =>
        listTasks(s, { ...a, dueBefore: a.dueBy ? startOfLocalDay(addDaysStr(a.dueBy, 1), ctx.tz) : undefined, limit: a.limit ?? 50 }),
      );
      return { count: rows.length, tasks: rows.map((t) => presentTask(t, ctx)) };
    },
  }),
  defineTool({
    name: "create_tasks",
    description: "Create one or more tasks (with optional subtasks). Returns the saved records with ids.",
    schema: z.object({ tasks: z.array(newTask).min(1).max(50) }),
    mutates: true,
    async execute(a, ctx) {
      const created = await ctx.run(async (s) => {
        const out = [];
        for (const t of a.tasks) {
          const task = await createTask(s, ctx.tz, t, "jarvis");
          const subs = [];
          for (const title of t.subtasks ?? []) subs.push(await createTask(s, ctx.tz, { title, parentId: task.id, courseId: t.courseId, projectId: t.projectId }, "jarvis"));
          out.push({ ...presentTask(task, ctx), subtasks: subs.map((x) => ({ id: x.id, title: x.title })) });
        }
        return out;
      });
      return { created, viewAt: "/tasks" };
    },
  }),
  defineTool({
    name: "update_task",
    description: "Update a task's title, notes, priority, due date or status. Set dueDate to null to clear it.",
    schema: z.object({
      id: idArg("Task"),
      title: z.string().min(1).max(300).optional(),
      notes: z.string().max(5000).nullable().optional(),
      priority: priority.optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      dueDate: dateArg().nullable().optional(),
      dueTime: timeArg().optional(),
    }),
    mutates: true,
    async execute({ id, ...patch }, ctx) {
      const t = await ctx.run((s) => updateTask(s, ctx.tz, id, patch));
      return { updated: presentTask(t, ctx) };
    },
  }),
  defineTool({
    name: "get_task",
    description: "Get one task with its subtasks.",
    schema: z.object({ id: idArg("Task") }),
    mutates: false,
    async execute({ id }, ctx) {
      const t = await ctx.run((s) => getTask(s, id));
      return { ...presentTask(t, ctx), subtasks: t.subtasks.map((x) => presentTask(x, ctx)) };
    },
  }),
  defineTool({
    name: "delete_task",
    description: "Delete a task and its subtasks. Requires the user's confirmation in the UI.",
    schema: z.object({ id: idArg("Task") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const t = await ctx.run((s) => getTask(s, id));
      return `Delete task "${t.title}"${t.subtasks.length ? ` and its ${t.subtasks.length} subtasks` : ""}?`;
    },
    async execute({ id }, ctx) {
      return { deleted: await ctx.run((s) => deleteTask(s, id)) };
    },
  }),
  defineTool({
    name: "list_projects",
    description: "List the user's projects.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listProjects(s));
      return { projects: rows.map((p) => ({ id: p.id, name: p.name, status: p.status, description: p.description })) };
    },
  }),
  defineTool({
    name: "create_project",
    description: "Create a project that tasks and notes can be linked to.",
    schema: z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional() }),
    mutates: true,
    async execute(a, ctx) {
      const p = await ctx.run((s) => createProject(s, a));
      return { created: { id: p.id, name: p.name }, viewAt: `/notes?project=${p.id}` };
    },
  }),
];
