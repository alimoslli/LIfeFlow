import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AGE_LINE, birthDateProblem, isUnderAge } from "@/lib/birthday";
import { COMPANIONS, companionOf, isCompanionKey, SKY_CHOICE, SKY_CHOICE_LABEL } from "@/lib/companions";
import { todayIn } from "@/lib/dates";
import { checkPassword } from "@/lib/password-strength";
import { ServiceError } from "./errors";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Database } from "../db/client";
import { users, type UserPreferences } from "../db/schema";
import { withUser } from "../db/with-user";
import { seedDefaultCategories } from "./finance/categories";
import { audit } from "./audit";
import { DeletionBlockedError, revokeOutsideAccess, type CleanupDeps } from "./account-cleanup";

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  timezone: z.string().max(64).default("UTC"),
});

export class AuthError extends Error {}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function registerUser(db: Database, input: z.input<typeof signupSchema>, opts: { accountKind?: "standard" | "demo" } = {}) {
  const data = signupSchema.parse(input);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing.length) throw new AuthError("An account with that email already exists.");
  const [user] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      timezone: isValidTimeZone(data.timezone) ? data.timezone : "UTC",
      accountKind: opts.accountKind ?? "standard",
    })
    .returning();
  await withUser(
    user.id,
    async (scope) => {
      await seedDefaultCategories(scope);
      await audit(scope, "user", "account.created");
    },
    db,
  );
  return user;
}

// Equalizes timing between "no such user" and "wrong password".
const DUMMY_HASH = "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function authenticate(db: Database, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  return user;
}

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
  studyTime: z.enum(["morning", "afternoon", "evening", "night"]).optional(),
  weekStartsOn: z.coerce
    .number()
    .pipe(z.union([z.literal(0), z.literal(1)]))
    .optional(),
  jarvisTone: z.enum(["concise", "balanced", "detailed"]).optional(),
  lifeStage: z.enum(["student", "working", "both", "life"]).optional(),
  /** "YYYY-MM-DD"; "" removes it; left out keeps what's saved. Checked against today in their time zone in updateProfile. */
  birthDate: z.string().trim().optional(),
});

export async function updateProfile(db: Database, userId: string, input: z.input<typeof profileSchema>) {
  const d = profileSchema.parse(input);
  const today = todayIn(d.timezone);
  // under 13 goes through the same flag as the welcome and Today, so a second, older year here is refused too
  if (d.birthDate && isUnderAge(d.birthDate, today)) {
    const { saveBirthday } = await import("./onboarding");
    await withUser(userId, (s) => saveBirthday(s, d.timezone, d.birthDate!));
    throw new ServiceError(AGE_LINE);
  }
  const problem = d.birthDate ? birthDateProblem(d.birthDate, today) : null;
  if (problem) throw new ServiceError(problem);
  const [current] = await db.select().from(users).where(eq(users.id, userId));
  // a locked account (under 13, owner 2026-11-10) can't get past it by typing another year here
  if (d.birthDate && current.preferences.ageBlockedAt) throw new ServiceError(AGE_LINE);
  const saved = await db
    .update(users)
    .set({
      name: d.name,
      timezone: d.timezone,
      preferences: {
        ...current.preferences,
        studyTime: d.studyTime,
        weekStartsOn: d.weekStartsOn,
        jarvisTone: d.jarvisTone ?? current.preferences.jarvisTone,
        lifeStage: d.lifeStage ?? current.preferences.lifeStage,
        birthDate: d.birthDate === undefined ? current.preferences.birthDate : d.birthDate || undefined,
      },
    })
    // a birthday never lands over a lock that a parallel save just set
    .where(and(eq(users.id, userId), d.birthDate ? sql`not (${users.preferences} ? 'ageBlockedAt')` : sql`true`))
    .returning({ id: users.id });
  if (!saved.length) throw new ServiceError(AGE_LINE);
}

/** Merges individual preference switches (e.g. memory suggestions) into the user's preferences. */
export async function updatePreferences(
  db: Database,
  userId: string,
  patch: Pick<UserPreferences, "memorySuggestions" | "onboarding" | "tour" | "notifications" | "moneyLock" | "jarvis" | "gmailFiling" | "aiConsentAt">,
) {
  const [current] = await db.select().from(users).where(eq(users.id, userId));
  await db
    .update(users)
    .set({ preferences: { ...current.preferences, ...patch } })
    .where(eq(users.id, userId));
}

export const assistantSchema = z.object({
  // Empty means no name yet: it stays "your skyling" until they choose one.
  name: z
    .string()
    .trim()
    .max(24, "Keep the name to 24 characters")
    .regex(/^$|^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u, "Use letters, numbers, spaces, apostrophes, dots or hyphens")
    .transform((n) => n || undefined),
  style: z.enum(["coach", "friend", "direct"]),
  notes: z.string().trim().max(300, "Keep personality notes to 300 characters").optional(),
  voice: z.enum(["alloy", "ash", "ballad", "cedar", "coral", "echo", "marin", "sage", "shimmer", "verse"]),
});

/** Saves the skyling's name, personality and voice. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time like 22:00");
export const jarvisSettingsSchema = z.object({
  frequency: z.enum(["low", "normal", "high"]),
  quietStart: hhmm,
  quietEnd: hhmm,
  topics: z.object({ money: z.boolean(), school: z.boolean(), work: z.boolean(), health: z.boolean(), habits: z.boolean() }),
  autonomy: z.object({ tasks: z.boolean(), calendar: z.boolean() }),
  avatar: z.enum(["spark", "orb", "initial"]),
  learning: z.boolean(),
  pushLimit: z.number().int().min(0).max(5),
});

/**
 * Picks the skyling (the cast). It brings its name unless the person gave the skyling their own (a name that is
 * another skyling's counts as not their own), and its tone.
 */
export async function setCompanion(db: Database, userId: string, key: unknown): Promise<{ name: string }> {
  if (key === SKY_CHOICE) {
    // "Changes with the sky": only the look follows the time; their name and talking style stay as they are
    const [current] = await db.select().from(users).where(eq(users.id, userId));
    await db
      .update(users)
      .set({ preferences: { ...current.preferences, companion: SKY_CHOICE } })
      .where(eq(users.id, userId));
    return { name: SKY_CHOICE_LABEL.name };
  }
  if (!isCompanionKey(key)) throw new ServiceError("Pick one of the six, or let the sky choose.");
  const c = companionOf(key);
  const [current] = await db.select().from(users).where(eq(users.id, userId));
  const name = current.preferences.assistantName?.trim();
  const own = !!name && !COMPANIONS.some((x) => x.name === name);
  await db
    .update(users)
    .set({ preferences: { ...current.preferences, companion: c.key, assistantName: own ? name : c.name, assistantStyle: c.tone } })
    .where(eq(users.id, userId));
  return c;
}

/** Name, tone, voice and how proactive the skyling is. */
export async function updateAssistant(
  db: Database,
  userId: string,
  input: z.input<typeof assistantSchema>,
  jarvis?: z.input<typeof jarvisSettingsSchema>,
  answerLength?: "concise" | "balanced" | "detailed",
) {
  const d = assistantSchema.parse(input);
  const j = jarvis ? jarvisSettingsSchema.parse(jarvis) : undefined;
  const [current] = await db.select().from(users).where(eq(users.id, userId));
  await db
    .update(users)
    .set({
      preferences: {
        ...current.preferences,
        assistantName: d.name,
        assistantStyle: d.style,
        assistantNotes: d.notes || undefined,
        assistantVoice: d.voice,
        ...(answerLength && ["concise", "balanced", "detailed"].includes(answerLength) && { jarvisTone: answerLength }),
        ...(j && { jarvis: { ...current.preferences.jarvis, ...j } }),
      },
    })
    .where(eq(users.id, userId));
}

/** Accounts made with Sign in with Apple have no password until they set one. */
export const hasPassword = (passwordHash: string) => passwordHash.startsWith("scrypt$");

export async function accountHasPassword(db: Database, userId: string) {
  const [u] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, userId));
  return !!u && hasPassword(u.h);
}

export async function changePassword(db: Database, userId: string, current: string, next: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AuthError("Account not found.");
  // Setting a first password (Apple-only account) needs no current one; changing one does.
  if (hasPassword(user.passwordHash) && !(await verifyPassword(current, user.passwordHash))) throw new AuthError("Your current password is incorrect.");
  const parsed = signupSchema.shape.password.safeParse(next);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  const strength = checkPassword(next, [user.name, user.email]);
  if (!strength.ok) throw new AuthError(`Choose a stronger password. ${strength.message}`);
  // A first password on a two-step account turns email codes off until a strong sign-in, so a stolen session plus the
  // inbox can't set a password and then reset two-step with an emailed code (security review, 2026-11-06).
  const firstPasswordOn2fa = !hasPassword(user.passwordHash) && !!user.totpEnabledAt;
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), ...(firstPasswordOn2fa ? { emailCodesBlockedAt: new Date() } : {}) })
    .where(eq(users.id, userId));
}

/** Permanently deletes the user and (via ON DELETE CASCADE) every row they own. */
export async function deleteAccount(db: Database, userId: string, password: string, deps: CleanupDeps = {}) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AuthError("Account not found.");
  if (hasPassword(user.passwordHash) && !(await verifyPassword(password, user.passwordHash))) throw new AuthError("Password is incorrect.");
  // Close what lives outside our database first: a plan that can't be cancelled stops the deletion; bank and Google revocation are best effort. The stored tokens go with the rows.
  try {
    await revokeOutsideAccess(db, user, deps);
  } catch (e) {
    if (e instanceof DeletionBlockedError) throw new AuthError(e.message);
    throw e;
  }
  await db.delete(users).where(eq(users.id, userId));
}
