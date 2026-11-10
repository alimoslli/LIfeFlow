import { eq } from "drizzle-orm";
import { z } from "zod";
import { COMPANION_KEYS, SKY_CHOICE } from "@/lib/companions";
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem, isUnderAge } from "@/lib/birthday";
import { todayIn } from "@/lib/dates";
import { ServiceError } from "./errors";
import { users } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assistantSchema } from "./accounts";
import { createManualAccount } from "./finance/accounts";
import { createMemory } from "./memory";
import { createCourse } from "./school";
import { createEmployer, fillRegularShifts, workScheduleSchema } from "./work";

/**
 * First-run setup. Everything the user entered is saved in one transaction
 * through the regular services, so a failed step leaves nothing half-done.
 */
export const onboardingSchema = z.object({
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  courses: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  job: z
    .object({
      name: z.string().trim().min(1).max(200),
      /** Dollars per hour; optional. */
      hourlyRate: z.number().min(0).max(10_000).optional(),
      /** Regular hours, e.g. full-time Mon–Fri 08:00–17:00. Left out when shifts change week to week. */
      schedule: workScheduleSchema.optional(),
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
  /** Their assistant's name and personality, chosen in "Make it yours". */
  assistant: z
    .object({
      name: assistantSchema.shape.name.optional(),
      style: z.enum(["coach", "friend", "direct"]),
      companion: z.enum([...COMPANION_KEYS, SKY_CHOICE]).optional(),
    })
    .optional(),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function completeOnboarding(scope: UserScope, input: OnboardingInput, tz = "UTC") {
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
    await createEmployer(scope, {
      name: d.job.name,
      payType: "hourly",
      hourlyRateCents: d.job.hourlyRate == null ? null : Math.round(d.job.hourlyRate * 100),
      schedule: d.job.schedule ?? null,
    });
    if (d.job.schedule) await fillRegularShifts(scope, tz, todayIn(tz));
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
  await finishOnboarding(
    scope,
    {
      lifeStage: d.lifeStage,
      studyTime: d.studyTime,
      jarvisTone: d.jarvisTone,
      assistantName: d.assistant?.name,
      assistantStyle: d.assistant?.style,
      companion: d.assistant?.companion,
    },
    tz,
  );
  return { courses, job: !!d.job, checking: !!d.checking, memory: !!d.aboutMe && d.aboutMe.length >= 3 };
}

/**
 * The welcome saves as it goes (owner, 2026-11-09: their classes come from connecting their school calendar, so the
 * welcome shows how easy connecting is and gets to know them, birthday included). Connecting leaves the page for
 * Google or Microsoft and comes back, so the skyling and "about you" are kept on the account before that.
 */
export const welcomeProgressSchema = z.object({
  assistant: z
    .object({
      name: assistantSchema.shape.name.optional(),
      style: z.enum(["coach", "friend", "direct"]),
      companion: z.enum([...COMPANION_KEYS, SKY_CHOICE]).optional(),
    })
    .optional(),
  name: z.string().trim().min(1, "Tell your skyling what to call you").max(80).optional(),
  birthDate: z.string().trim().optional(),
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  school: z.string().trim().max(120).optional(),
  /** Where they work: kept until setup finishes, which makes it an employer (connecting leaves the page and comes back). */
  job: z.string().trim().max(200).optional(),
});

type Prefs = typeof users.$inferSelect.preferences;
const prefsOf = async (scope: UserScope) =>
  (await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)))[0].preferences;

/**
 * Under 13 (owner, 2026-11-10): one calm line, and the welcome stays locked for this account. Only the flag is kept:
 * not the birthday, nor anything else they typed. Returned rather than thrown, so the flag is committed.
 */
async function blockUnderAge(scope: UserScope, prefs: Prefs) {
  const { birthDate: _birth, school: _school, welcomeJob: _job, ...rest } = prefs;
  void _birth;
  void _school;
  void _job;
  await scope.tx
    .update(users)
    .set({ preferences: { ...rest, ageBlockedAt: new Date().toISOString() } })
    .where(eq(users.id, scope.userId));
  return { blocked: true as const };
}

export async function saveWelcomeProgress(scope: UserScope, tz: string, input: z.input<typeof welcomeProgressSchema>): Promise<{ blocked: boolean }> {
  const d = welcomeProgressSchema.parse(input);
  const current = await prefsOf(scope);
  if (current.ageBlockedAt) return { blocked: true };
  if (d.birthDate && isUnderAge(d.birthDate, todayIn(tz))) return blockUnderAge(scope, current);
  if (d.birthDate) {
    const problem = birthDateProblem(d.birthDate, todayIn(tz));
    if (problem) throw new ServiceError(problem);
  }
  const prefs = {
    ...current,
    ...(d.assistant ? { assistantName: d.assistant.name, assistantStyle: d.assistant.style, companion: d.assistant.companion } : {}),
    ...(d.birthDate ? { birthDate: d.birthDate } : {}),
    ...(d.lifeStage ? { lifeStage: d.lifeStage } : {}),
    ...(d.school !== undefined ? { school: d.school || undefined } : {}),
    ...(d.job !== undefined ? { welcomeJob: d.job || undefined } : {}),
  };
  await scope.tx
    .update(users)
    .set({ preferences: prefs, ...(d.name ? { name: d.name.replace(/\s+/g, " ") } : {}) })
    .where(eq(users.id, scope.userId));
  return { blocked: false };
}

/** The birthday asked once on Today from accounts made before it was required (not a lockout). Same rules. */
export async function saveBirthday(scope: UserScope, tz: string, birthDate: string): Promise<{ blocked: boolean }> {
  const current = await prefsOf(scope);
  if (current.ageBlockedAt) return { blocked: true };
  const birth = z.string().trim().parse(birthDate);
  if (isUnderAge(birth, todayIn(tz))) return blockUnderAge(scope, current);
  const problem = birthDateProblem(birth, todayIn(tz));
  if (problem) throw new ServiceError(problem);
  await scope.tx
    .update(users)
    .set({ preferences: { ...current, birthDate: birth } })
    .where(eq(users.id, scope.userId));
  return { blocked: false };
}

/** The name they want to be called, asked on the first screen after sign-up. */
export async function setDisplayName(scope: UserScope, name: string) {
  const clean = z.string().trim().min(1, "Enter a name").max(80).parse(name).replace(/\s+/g, " ");
  await scope.tx.update(users).set({ name: clean }).where(eq(users.id, scope.userId));
}

/** Marks setup finished (also used by "Skip setup") and queues the guided tour. */
export async function finishOnboarding(
  scope: UserScope,
  prefs: Partial<Pick<typeof users.$inferSelect.preferences, "lifeStage" | "studyTime" | "jarvisTone" | "assistantName" | "assistantStyle" | "companion">> = {},
  tz = "UTC",
) {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  // setup finishes (or is skipped) only with a real birthday, 13 or older, checked here on the server (owner, 2026-11-10)
  if (u.preferences.ageBlockedAt) throw new ServiceError(AGE_LINE);
  if (!u.preferences.birthDate || birthDateProblem(u.preferences.birthDate, todayIn(tz))) throw new ServiceError(BIRTHDAY_NEEDED);
  const defined = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, ...defined, welcomeJob: undefined, onboarding: "done", tour: "pending" } })
    .where(eq(users.id, scope.userId));
}

export async function setTourState(scope: UserScope, tour: "pending" | "done") {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, tour } })
    .where(eq(users.id, scope.userId));
}
