import { z } from "zod";
import { createPromise, listPromises, promiseStats, resolvePromise } from "../../services/promises";
import { localDateOf, localTimeOf } from "@/lib/dates";
import { dateArg, defineTool, idArg, timeArg, type ToolContext } from "../tool";

const present = (p: { id: string; text: string; dueAt: Date; status: string; moves: number }, ctx: ToolContext) => ({
  id: p.id,
  text: p.text,
  status: p.status,
  checkInDate: localDateOf(p.dueAt, ctx.tz),
  checkInTime: localTimeOf(p.dueAt, ctx.tz),
});

export const promiseTools = [
  defineTool({
    name: "make_promise",
    description:
      'Save a promise: something the user just said they WILL do (or hold back from) where keeping their word is the point, usually today or tonight ("I\'m not eating out tonight", "I\'ll hit the gym tonight"). NOT an errand with a finish line (that is a to-do: create_tasks) and NOT a weeks-long outcome (that is a goal). Only a clear first-person commitment, never wishes, questions or things you suggest. The assistant checks back once at the check-in time (9 PM that day if no time is given). Optionally tie it to a to-do (taskId): finishing the to-do then keeps the promise.',
    schema: z.object({
      text: z.string().min(2).max(200).describe("What they said they'd do, short, in their words"),
      date: dateArg("Local date to check back (default today)").optional(),
      time: timeArg("Local time to check back (default 21:00)").optional(),
      taskId: idArg("To-do this promise is about").optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const { promise, created } = await ctx.run((s) =>
        createPromise(s, ctx.tz, { text: a.text, dueDate: a.date, dueTime: a.time, taskId: a.taskId }, ctx.now),
      );
      return { saved: created, promise: present(promise, ctx), viewAt: "/" };
    },
  }),
  defineTool({
    name: "list_promises",
    description:
      "The user's open promises (what they said they'd do and when you'll check back), plus how many they kept this week and broke in the last 14 days.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const [open, stats] = await ctx.run(async (s) => [await listPromises(s), await promiseStats(s, ctx.now)] as const);
      return { promises: open.map((p) => present(p, ctx)), ...stats };
    },
  }),
  defineTool({
    name: "resolve_promise",
    description:
      'Record how a promise went, ONLY when the user says so themselves in this message ("I did it" is kept, "I didn\'t" or "it didn\'t happen" is broken). Never guess, never mark one from silence or from a to-do alone. Returns how many were broken in the last 14 days and kept this week so you can answer in your own voice: warm when kept; honest and never shaming when broken; at 3 or more broken in 14 days you may be firmer and playful (not harsh), and offer a smaller promise.',
    schema: z.object({ id: idArg("Promise"), outcome: z.enum(["kept", "broken"]) }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run((s) => resolvePromise(s, a.id, a.outcome, "you", ctx.now));
      const stats = await ctx.run((s) => promiseStats(s, ctx.now));
      return { changed: r.changed, promise: present(r.promise, ctx), ...stats, viewAt: "/" };
    },
  }),
];
