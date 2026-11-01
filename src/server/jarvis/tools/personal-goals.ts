import { z } from "zod";
import { createPersonalGoal, deletePersonalGoal, listPersonalGoals, updatePersonalGoal } from "../../services/personal-goals";
import { dateArg, defineTool, idArg } from "../tool";

/** Goals that aren't about money ("Run a 5K", "Read 12 books"). Money goals are list_goals / create_goal. */
const present = (g: Awaited<ReturnType<typeof listPersonalGoals>>[number]) => ({
  id: g.id,
  title: g.title,
  progress: g.target != null ? `${g.progress} of ${g.target}${g.unit ? ` ${g.unit}` : ""}` : null,
  targetDate: g.targetDate,
  done: !!g.doneAt,
});

export const personalGoalTools = [
  defineTool({
    name: "list_personal_goals",
    description: "The user's goals that aren't about money (fitness, reading, school, personal), with progress and whether they're done.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      return { goals: (await ctx.run(listPersonalGoals)).map(present), viewAt: "/goals" };
    },
  }),
  defineTool({
    name: "create_personal_goal",
    description:
      "Create a goal that isn't about money. Optional: a number to reach with its unit (12 books) and a date. For saving or paying off money, use create_goal.",
    schema: z.object({
      title: z.string().min(1).max(200),
      target: z.number().int().min(1).optional(),
      unit: z.string().max(40).optional(),
      targetDate: dateArg("Date to reach it by").optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const g = await ctx.run((s) => createPersonalGoal(s, a));
      return { created: present(g), viewAt: "/goals" };
    },
  }),
  defineTool({
    name: "update_personal_goal",
    description: "Update a non-money goal: progress so far, mark it done or not done, or change its name, number, unit or date.",
    schema: z.object({
      id: idArg("Personal goal"),
      progress: z.number().int().min(0).optional(),
      done: z.boolean().optional(),
      title: z.string().min(1).max(200).optional(),
      target: z.number().int().min(1).nullable().optional(),
      unit: z.string().max(40).nullable().optional(),
      targetDate: dateArg().nullable().optional(),
    }),
    mutates: true,
    async execute({ id, ...change }, ctx) {
      const g = await ctx.run((s) => updatePersonalGoal(s, id, change));
      return { updated: present(g), viewAt: "/goals" };
    },
  }),
  defineTool({
    name: "delete_personal_goal",
    description: "Delete a non-money goal for good. Requires the user's confirmation.",
    schema: z.object({ id: idArg("Personal goal") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const g = (await ctx.run(listPersonalGoals)).find((x) => x.id === id);
      return `Delete the goal "${g?.title ?? "this goal"}"?`;
    },
    async execute({ id }, ctx) {
      const g = await ctx.run((s) => deletePersonalGoal(s, id));
      return { deleted: g.title, viewAt: "/goals" };
    },
  }),
];
