import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withUser, type UserScope } from "@/server/db/with-user";
import { registerUser } from "@/server/services/accounts";

export const TZ = "America/New_York";

/** Creates a fresh user (with default categories) and returns a scope runner. */
export async function makeUser(name = "Test User") {
  const db = getDb();
  const user = await registerUser(db, {
    name,
    email: `${randomUUID()}@test.local`,
    password: "correct horse battery",
    timezone: TZ,
  });
  const run = <T>(fn: (scope: UserScope) => Promise<T>) => withUser(user.id, fn);
  return { user, run };
}
