import { z } from "zod";
import { eq } from "drizzle-orm";
import { lifeMilestones, MILESTONE_CATEGORIES, personalGoals } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { createMemory, listActiveMemories, sensitiveContentReason, similarContent } from "./memory";
import { createMilestone, isValidWhen } from "./milestones";
import { createPersonalGoal } from "./personal-goals";

/**
 * Saves what the user ticked after pasting another AI's answer (see lib/life-import.ts).
 * The text came from outside, so it's validated again here: sensitive lines are dropped,
 * and anything already known (similar memory, same milestone or goal title) is skipped.
 */

export const importItemsSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("fact"), text: z.string().trim().min(3).max(500), category: z.enum(["fact", "preference", "routine"]) }),
      z.object({
        kind: z.literal("milestone"),
        text: z.string().trim().min(2).max(200),
        when: z.string().trim().max(40).nullish(),
        category: z.enum(MILESTONE_CATEGORIES),
      }),
      z.object({ kind: z.literal("goal"), text: z.string().trim().min(1).max(200) }),
    ]),
  )
  .max(120);

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function saveLifeImport(scope: UserScope, input: unknown) {
  const items = importItemsSchema.parse(input);
  const known = (await listActiveMemories(scope)).map((m) => m.content);
  const milestoneTitles = new Set(
    (await scope.tx.select({ t: lifeMilestones.title }).from(lifeMilestones).where(eq(lifeMilestones.userId, scope.userId))).map((r) => key(r.t)),
  );
  const goalTitles = new Set(
    (await scope.tx.select({ t: personalGoals.title }).from(personalGoals).where(eq(personalGoals.userId, scope.userId))).map((r) => key(r.t)),
  );
  const saved = { facts: 0, milestones: 0, goals: 0 };
  let skipped = 0;
  for (const it of items) {
    if (sensitiveContentReason(it.text)) {
      skipped++;
      continue;
    }
    if (it.kind === "fact") {
      if (known.some((c) => similarContent(c, it.text))) {
        skipped++;
        continue;
      }
      await createMemory(scope, { content: it.text, category: it.category }, "user");
      known.push(it.text);
      saved.facts++;
    } else if (it.kind === "milestone") {
      if (milestoneTitles.has(key(it.text))) {
        skipped++;
        continue;
      }
      // A date we can't read is dropped rather than failing the whole import.
      await createMilestone(scope, { title: it.text, category: it.category, when: it.when && isValidWhen(it.when) ? it.when : null }, "import");
      milestoneTitles.add(key(it.text));
      saved.milestones++;
    } else {
      if (goalTitles.has(key(it.text))) {
        skipped++;
        continue;
      }
      await createPersonalGoal(scope, { title: it.text });
      goalTitles.add(key(it.text));
      saved.goals++;
    }
  }
  return { ...saved, skipped };
}
