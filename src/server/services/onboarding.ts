import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { createManualAccount } from "./finance/accounts";
import { createMemory } from "./memory";
import { createCourse } from "./school";
import { createEmployer } from "./work";

/**
 * First-run setup. Everything the user entered is saved in one transaction
 * through the regular services, so a failed step leaves nothing half-done.
 */
export const onboardingSchema = z.object({
  lifeStage: z.enum(["student", "working", "both"]).optional(),
  courses: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  job: z
    .object({
      name: z.string().trim().min(1).max(200),
      /** Dollars per hour; optional. */
      hourlyRate: z.number().min(0).max(10_000).optional(),
    })
    .optional(),
  checking: z
    .object({
      name: z.string().trim().min(1).max(120).default("Checking"),
      /** Current balance in dollars, as the user sees it in their bank app. */
      balance: z.number().min(-10_000_000).max(10_000_000),
    })
    .optional(),
  studyTime: z.enum(["morning", "afternoon", "evening", "night"]).optional(),
  jarvisTone: z.enum(["concise", "balanced", "detailed"]).optional(),
  /** Something the user wants Jarvis to know; saved as a confirmed memory. */
  aboutMe: z.string().trim().max(500).optional(),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function completeOnboarding(scope: UserScope, input: OnboardingInput) {
  const d = onboardingSchema.parse(input);
  const seen = new Set<string>();
  let courses = 0;
  for (const name of d.courses) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    await createCourse(scope, { name });
    courses++;
  }
  if (d.job) {
    await createEmployer(scope, { name: d.job.name, payType: "hourly", hourlyRateCents: d.job.hourlyRate == null ? null : Math.round(d.job.hourlyRate * 100) });
  }
  if (d.checking) {
    await createManualAccount(scope, {
      name: d.checking.name,
      type: "depository",
      subtype: "checking",
      currentBalanceCents: Math.round(d.checking.balance * 100),
    });
  }
  if (d.aboutMe && d.aboutMe.length >= 3) {
    await createMemory(scope, { content: d.aboutMe, category: "fact" }, "user");
  }
  await finishOnboarding(scope, { lifeStage: d.lifeStage, studyTime: d.studyTime, jarvisTone: d.jarvisTone });
  return { courses, job: !!d.job, checking: !!d.checking, memory: !!d.aboutMe && d.aboutMe.length >= 3 };
}

/** Marks setup finished (also used by "Skip setup") and queues the guided tour. */
export async function finishOnboarding(
  scope: UserScope,
  prefs: Partial<Pick<typeof users.$inferSelect.preferences, "lifeStage" | "studyTime" | "jarvisTone">> = {},
) {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  const defined = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, ...defined, onboarding: "done", tour: "pending" } })
    .where(eq(users.id, scope.userId));
}

export async function setTourState(scope: UserScope, tour: "pending" | "done") {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, tour } })
    .where(eq(users.id, scope.userId));
}
