import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withUser, type UserScope } from "@/server/db/with-user";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { registerUser } from "@/server/services/accounts";

export const TZ = "America/New_York";

/** Creates a fresh user (with default categories) and returns a scope runner. */
export async function makeUser(name = "Test User", opts: { ai?: boolean } = {}) {
  const db = getDb();
  const user = await registerUser(db, {
    name,
    email: `${randomUUID()}@test.local`,
    password: "correct horse battery",
    timezone: TZ,
  });
  // Most tests exercise AI features; the consent gate has its own tests (ai: false).
  if (opts.ai !== false) {
    user.preferences = { ...user.preferences, aiConsentAt: "2026-01-01T00:00:00.000Z" };
    await db.update(users).set({ preferences: user.preferences }).where(eq(users.id, user.id));
  }
  const run = <T>(fn: (scope: UserScope) => Promise<T>) => withUser(user.id, fn);
  return { user, run };
}
