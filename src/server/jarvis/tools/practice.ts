import { z } from "zod";
import { missedPractice, recordPractice } from "../../services/practice";
import { defineTool, idArg } from "../tool";

/** Gamechanger 2 (owner, 2026-11-26): practice before an exam, and only what they missed the night before. */
export const practiceTools = [
  defineTool({
    name: "record_practice",
    description:
      "Save the practice questions you just asked for an upcoming exam or quiz, and whether the student got each one, so the night before you can quiz only what they missed. Call it after a practice round in the chat. Practice questions you wrote from their course's topics only, never a question from a graded assignment, and never give answers to graded work.",
    schema: z.object({
      assignmentId: idArg("Exam or quiz"),
      items: z
        .array(z.object({ question: z.string().min(3).max(300), gotIt: z.boolean().describe("True only if their answer was right") }))
        .min(1)
        .max(20),
    }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run((s) => recordPractice(s, a.assignmentId, a.items, ctx.now));
      return { ...r, viewAt: "/school?view=upcoming#due" };
    },
  }),
  defineTool({
    name: "missed_practice",
    description:
      "The practice questions the student got wrong last time for an exam or quiz (a later right answer clears one). Use before a review round, e.g. the night before, to quiz only those.",
    schema: z.object({ assignmentId: idArg("Exam or quiz") }),
    mutates: false,
    async execute(a, ctx) {
      return ctx.run((s) => missedPractice(s, a.assignmentId));
    },
  }),
];
