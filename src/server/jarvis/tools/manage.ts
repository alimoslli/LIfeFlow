import { z } from "zod";
import { getProject, updateProject } from "../../services/notes";
import { createHabit, checkHabit, deleteHabit, listHabits, updateHabit } from "../../services/habits";
import { getCourse, updateCourse } from "../../services/school";
import { moveToTrash } from "../../services/trash";
import { archiveEmployer, listEmployers, updateEmployer } from "../../services/work";
import { dateArg, defineTool, idArg, moneyArg, toCents, toDollars } from "../tool";

/** Edit and remove the things other tools create: courses, projects, jobs, habits. */
export const manageTools = [
  defineTool({
    name: "update_course",
    description: "Change a course's name, code, term, instructor, meeting times or location. Only pass fields that change.",
    schema: z.object({
      id: idArg("Course"),
      name: z.string().min(1).max(200).optional(),
      code: z.string().max(40).optional(),
      term: z.string().max(60).optional(),
      instructorName: z.string().max(120).optional(),
      instructorEmail: z.string().email().optional(),
      meetingInfo: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
    }),
    mutates: true,
    async execute({ id, ...patch }, ctx) {
      const c = await ctx.run((s) => updateCourse(s, id, patch));
      return { updated: { id: c.id, name: c.name, code: c.code, meetingInfo: c.meetingInfo }, viewAt: `/school/courses/${c.id}` };
    },
  }),
  defineTool({
    name: "delete_course",
    description: "Delete a course and its assignments (restorable from Trash). Requires the user's confirmation.",
    schema: z.object({ id: idArg("Course") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const c = await ctx.run((s) => getCourse(s, id));
      return `Delete ${c.name} and its assignments? You can restore it from Trash.`;
    },
    async execute({ id }, ctx) {
      const t = await ctx.run((s) => moveToTrash(s, "course", id));
      return { deleted: t.label, restorableFromTrash: true };
    },
  }),
  defineTool({
    name: "update_project",
    description: "Rename a project, change its description, or set its status (active, paused, completed, archived).",
    schema: z.object({
      id: idArg("Project"),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    }),
    mutates: true,
    async execute({ id, ...patch }, ctx) {
      const p = await ctx.run((s) => updateProject(s, id, patch));
      return { updated: { id: p.id, name: p.name, status: p.status }, viewAt: `/notes?project=${p.id}` };
    },
  }),
  defineTool({
    name: "delete_project",
    description: "Delete a project (restorable from Trash). Its to-dos stay. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Project") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const p = await ctx.run((s) => getProject(s, id));
      return `Delete the project "${p.name}"? Its to-dos stay.`;
    },
    async execute({ id }, ctx) {
      const t = await ctx.run((s) => moveToTrash(s, "project", id));
      return { deleted: t.label, restorableFromTrash: true };
    },
  }),
  defineTool({
    name: "update_job",
    description: "Change a job's name, position or hourly rate. Only pass fields that change.",
    schema: z.object({
      id: idArg("Job"),
      name: z.string().min(1).max(200).optional(),
      position: z.string().max(120).optional(),
      hourlyRate: moneyArg("Hourly rate").optional(),
      overtimeAfterHours: z.number().min(0).max(168).optional(),
    }),
    mutates: true,
    async execute({ id, hourlyRate, overtimeAfterHours, ...patch }, ctx) {
      const e = await ctx.run((s) =>
        updateEmployer(s, id, {
          ...patch,
          ...(hourlyRate !== undefined && { hourlyRateCents: toCents(hourlyRate) }),
          ...(overtimeAfterHours !== undefined && { overtimeThresholdHours: overtimeAfterHours }),
        }),
      );
      return {
        updated: { id: e.id, name: e.name, position: e.position, hourlyRate: e.hourlyRateCents == null ? null : toDollars(e.hourlyRateCents) },
        viewAt: "/work",
      };
    },
  }),
  defineTool({
    name: "remove_job",
    description: "Remove a job the user left. Past shifts and pay are kept. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Job") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const e = (await ctx.run((s) => listEmployers(s))).find((x) => x.id === id);
      if (!e) throw new Error("No such job. Use list_jobs.");
      return `Remove ${e.name}? Past shifts and pay stay in your history.`;
    },
    async execute({ id }, ctx) {
      const e = await ctx.run((s) => archiveEmployer(s, id));
      return { removed: e.name, pastShiftsKept: true };
    },
  }),
  defineTool({
    name: "list_habits",
    description: "The user's habits with current and best streaks and whether this period is done.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listHabits(s, ctx.today));
      return {
        habits: rows.map((h) => ({
          id: h.id,
          title: h.title,
          cadence: h.cadence,
          active: h.active,
          streak: h.current,
          best: h.best,
          doneThisPeriod: h.doneThisPeriod,
        })),
        viewAt: "/habits",
      };
    },
  }),
  defineTool({
    name: "create_habit",
    description:
      "Start a habit. kind: save (target = dollars per period), study (target = minutes), no_spend, custom. cadence: daily, weekly, weekends, payday.",
    schema: z.object({
      title: z.string().min(1).max(120),
      kind: z.enum(["save", "no_spend", "study", "custom"]).optional(),
      cadence: z.enum(["daily", "weekly", "weekends", "payday"]).optional(),
      target: z.number().min(1).max(100_000).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const target = a.target === undefined ? null : a.kind === "save" ? toCents(a.target) : Math.round(a.target);
      const h = await ctx.run((s) => createHabit(s, { title: a.title, kind: a.kind, cadence: a.cadence, target }));
      return { created: { id: h.id, title: h.title, cadence: h.cadence }, viewAt: "/habits" };
    },
  }),
  defineTool({
    name: "delete_habit",
    description: "Delete a habit and its check-ins for good. Requires the user's confirmation. To stop tracking but keep history, use check_habit with pause.",
    schema: z.object({ id: idArg("Habit") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const h = (await ctx.run((s) => listHabits(s, ctx.today))).find((x) => x.id === id);
      return `Delete the habit "${h?.title ?? "this habit"}" and its history?`;
    },
    async execute({ id }, ctx) {
      const h = await ctx.run((s) => deleteHabit(s, id));
      return { deleted: h.title, viewAt: "/habits" };
    },
  }),
  defineTool({
    name: "check_habit",
    description: "Mark a habit done (or not done) for a day, default today. Use pause to stop tracking it.",
    schema: z.object({ id: idArg("Habit"), date: dateArg().optional(), done: z.boolean().optional(), pause: z.boolean().optional() }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        if (a.pause !== undefined) await updateHabit(s, a.id, { active: !a.pause });
        else await checkHabit(s, a.id, a.date ?? ctx.today, a.done ?? true);
        const h = (await listHabits(s, ctx.today)).find((x) => x.id === a.id)!;
        return { habit: { id: h.id, title: h.title, streak: h.current, best: h.best, doneThisPeriod: h.doneThisPeriod, active: h.active }, viewAt: "/habits" };
      });
    },
  }),
];
