import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { withUser } from "../db/with-user";
import { seedDefaultCategories } from "./finance/categories";
import { audit } from "./audit";

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

export async function registerUser(
  db: Database,
  input: z.input<typeof signupSchema>,
  opts: { accountKind?: "standard" | "demo" } = {},
) {
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
  weekStartsOn: z.coerce.number().pipe(z.union([z.literal(0), z.literal(1)])).optional(),
  jarvisTone: z.enum(["concise", "balanced", "detailed"]).optional(),
});

export async function updateProfile(db: Database, userId: string, input: z.input<typeof profileSchema>) {
  const d = profileSchema.parse(input);
  const [current] = await db.select().from(users).where(eq(users.id, userId));
  await db
    .update(users)
    .set({ name: d.name, timezone: d.timezone, preferences: { ...current.preferences, studyTime: d.studyTime, weekStartsOn: d.weekStartsOn, jarvisTone: d.jarvisTone } })
    .where(eq(users.id, userId));
}

export async function changePassword(db: Database, userId: string, current: string, next: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) throw new AuthError("Your current password is incorrect.");
  const parsed = signupSchema.shape.password.safeParse(next);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
}

/** Permanently deletes the user and (via ON DELETE CASCADE) every row they own. */
export async function deleteAccount(db: Database, userId: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new AuthError("Password is incorrect.");
  await db.delete(users).where(eq(users.id, userId));
}
