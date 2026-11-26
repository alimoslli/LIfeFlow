import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { extensionDraft, shiftSwapDraft } from "../../services/drafts";
import { defineTool, idArg } from "../tool";

/** The name they go by, for signing a message. */
export async function signName(s: UserScope) {
  const [u] = await s.tx.select({ name: users.name }).from(users).where(eq(users.id, s.userId));
  return u?.name ?? "";
}

const NEVER_SENT = "Show the text exactly as returned so they can copy it. You never send it for them.";

/** Gamechangers 3 and 4 (owner, 2026-11-26): ready texts written by our code from their real records. */
export const draftTools = [
  defineTool({
    name: "draft_shift_swap",
    description: `Write a ready text asking coworkers or a manager to take one of the user's shifts because of an exam or a deadline, from the real shift and assignment. Use when a shift clashes with schoolwork and they want to swap it. ${NEVER_SENT}`,
    schema: z.object({ shiftId: idArg("Shift"), assignmentId: idArg("Assignment (the exam or deadline)") }),
    mutates: false,
    async execute(a, ctx) {
      const text = await ctx.run((s) => shiftSwapDraft(s, ctx.tz, a.shiftId, a.assignmentId));
      return { draft: text, note: NEVER_SENT };
    },
  }),
  defineTool({
    name: "draft_extension_email",
    description: `Write a short, polite email to the professor asking for an extension on one assignment, with its real due date. Use when they ask, or when their week can't fit it and they want to ask. Ask what new date they want first; include what they've done so far only in their words. ${NEVER_SENT}`,
    schema: z.object({
      assignmentId: idArg("Assignment"),
      askFor: z.string().min(2).max(60).describe("The new date or time they want, in plain words, e.g. 'Monday' or 'two more days'"),
      doneSoFar: z.string().max(200).optional().describe("What they've done so far, in their own words, only if they said it"),
    }),
    mutates: false,
    async execute(a, ctx) {
      const email = await ctx.run(async (s) => extensionDraft(s, ctx.tz, a.assignmentId, { asked: a.askFor, done: a.doneSoFar, name: await signName(s) }));
      return { draft: email, note: email.to ? NEVER_SENT : `${NEVER_SENT} No professor email is saved for this class; say so.` };
    },
  }),
];
