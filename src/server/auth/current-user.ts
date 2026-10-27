import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, deleteSession, validateSession, type SessionUser } from "./sessions";

/** Current user for this request (memoized per render), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Runs `fn` in the signed-in user's RLS scope. */
export async function withCurrentUser<T>(fn: (scope: UserScope, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user.id, (scope) => fn(scope, user));
}

export async function startSession(userId: string) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, ua);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
}

/** Client IP for rate limiting (best effort; trusts the platform proxy header). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
