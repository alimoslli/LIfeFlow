import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, deleteSession, validateSession, type SessionUser } from "./sessions";

const sessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token);
});

/**
 * Under 13, during setup or later (owner, 2026-11-10): the account is locked. Its session reaches only the welcome's lock screen
 * and signing out, so every page, server action and API route that asks for the user gets none (APIs answer 401).
 */
export const ageLocked = (u: SessionUser | null | undefined) => !!u?.preferences?.ageBlockedAt;

/** Current user for this request (memoized per render), or null (also for an age-locked account). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await sessionUser();
  return ageLocked(user) ? null : user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await sessionUser();
  if (!user) redirect("/login");
  if (ageLocked(user)) redirect("/welcome");
  return user;
}

/** The welcome page only: the signed-in user even when the account is age-locked, so it can show the lock screen. */
export async function requireUserForWelcome(): Promise<SessionUser> {
  const user = await sessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Runs `fn` in the signed-in user's RLS scope. */
export async function withCurrentUser<T>(fn: (scope: UserScope, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user.id, (scope) => fn(scope, user));
}

export async function startSession(userId: string, opts: { secondStepSkipped?: boolean } = {}) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, ua, opts);
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
  return ipFromHeaders(await headers());
}

/**
 * The caller's IP for rate limiting. The first X-Forwarded-For entry is
 * whatever the client sent, so it can't be trusted on its own. Prefer the
 * header the host sets itself (Vercel), then X-Real-IP, then the entry the
 * nearest proxy appended (the last one).
 */
export function ipFromHeaders(h: { get(name: string): string | null }): string {
  const vercel = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const chain =
    h
      .get("x-forwarded-for")
      ?.split(",")
      .map((x) => x.trim())
      .filter(Boolean) ?? [];
  return chain.at(-1) || "unknown";
}
