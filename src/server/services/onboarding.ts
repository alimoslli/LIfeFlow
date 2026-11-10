import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { COMPANION_KEYS, SKY_CHOICE } from "@/lib/companions";
import { AGE_LINE, BIRTHDAY_NEEDED, birthDateProblem, isUnderAge } from "@/lib/birthday";
import { todayIn } from "@/lib/dates";
import { ServiceError } from "./errors";
import { integrations, users } from "../db/schema";
import { closeAtProvider, OUTSIDE_PROVIDERS } from "./account-cleanup";
import { provisionalName } from "@/lib/provisional-name";
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
/** A write that must never land over a lock (a parallel save can't clear the flag). */
const notLocked = sql`not (${users.preferences} ? 'ageBlockedAt')`;
/** Their preferences, read for update: a birthday save and a block can't cross each other (two tabs, two taps). */
const prefsOf = async (scope: UserScope) =>
  (await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update"))[0].preferences;

/**
 * What an age-locked account keeps: the email (on the user row), how they sign in, and the security log (sign-ins and account
 * actions, `audit_events`), as the Privacy Policy's section 9 says. Every other table with a user_id is emptied.
 */
const KEEP_ON_LOCK = new Set([
  "users",
  "sessions",
  "oauth_identities",
  "passkeys",
  "recovery_codes",
  "login_challenges",
  "auth_challenges",
  "password_resets",
  "audit_events",
]);

/**
 * Under 13 (owner, 2026-11-10): one calm line, and the account is locked. During setup nothing they gave is kept (the
 * review of b3effa0): the name goes back to the stand-in from their email, the preferences keep only the lock, a Google
 * connection is revoked, and every row they own is removed except how they sign in. Returned rather than thrown, so
 * it's committed. An account that already finished setup is only flagged here: whether to lock it is the owner's call.
 */
async function blockUnderAge(scope: UserScope, prefs: Prefs) {
  const at = new Date().toISOString();
  if (prefs.onboarding !== "pending") {
    const { birthDate: _birth, ...rest } = prefs;
    void _birth;
    await scope.tx
      .update(users)
      .set({ preferences: { ...rest, ageBlockedAt: at } })
      .where(eq(users.id, scope.userId));
    return { blocked: true as const };
  }
  const [me] = await scope.tx.select({ email: users.email }).from(users).where(eq(users.id, scope.userId));
  // what they connected in the welcome is closed where it lives too, the same way deleting an account does: a bank link at
  // Plaid, a Google grant at Google (best effort, in parallel, a few seconds at most; no database work in these calls)
  const outside = await scope.tx
    .select({ provider: integrations.provider, encryptedCredentials: integrations.encryptedCredentials })
    .from(integrations)
    .where(and(eq(integrations.userId, scope.userId), inArray(integrations.provider, OUTSIDE_PROVIDERS)));
  const f: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) });
  await Promise.all(outside.map((row) => closeAtProvider(row, f).catch(() => {})));
  // every table that holds their rows, found from the database so a new one can't be missed: a new table with a user_id is
  // emptied unless it is listed in KEEP_ON_LOCK (tests/integration/onboarding.test.ts checks this). Only real tables: a view
  // can't be deleted from, and one must never make this save throw.
  const tables = await scope.tx.execute<{ table_name: string }>(
    sql`select distinct c.table_name from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.column_name = 'user_id' and c.table_schema = current_schema()`,
  );
  for (const { table_name } of tables.rows) {
    if (KEEP_ON_LOCK.has(table_name)) continue;
    await scope.tx.execute(sql`delete from ${sql.identifier(table_name)} where user_id = ${scope.userId}`);
  }
  await scope.tx
    .update(users)
    // nothing of theirs on the account row either: their time zone, forwarding address and texting number go too
    .set({
      name: provisionalName(me.email),
      timezone: "UTC",
      inboxToken: null,
      smsPhone: null,
      preferences: { onboarding: prefs.onboarding, ageBlockedAt: at },
    })
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
    .where(and(eq(users.id, scope.userId), notLocked));
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
    .where(and(eq(users.id, scope.userId), notLocked));
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
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update");
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
