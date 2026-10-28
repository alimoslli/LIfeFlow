"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CHALLENGE_COOKIE, completeLoginChallenge, createLoginChallenge } from "@/server/auth/two-factor";
import { ZodError } from "zod";
import { clientIp, endSession, startSession } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { purgeOldRateLimits, rateLimit } from "@/server/rate-limit";
import { purgeExpiredSessions } from "@/server/auth/sessions";
import { AuthError, authenticate, registerUser, updatePreferences } from "@/server/services/accounts";
import { checkPassword } from "@/lib/password-strength";
import { audit } from "@/server/services/audit";

export type AuthState = { error?: string; email?: string } | null;

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
};

export async function login(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(fd.get("password") ?? "");
  const db = getDb();
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(db, `login:ip:${ip}`, 30, 900), rateLimit(db, `login:email:${email}`, 8, 900)]);
  if (!byIp.allowed || !byEmail.allowed) return { error: "Too many sign-in attempts. Please wait a few minutes and try again.", email };
  const user = await authenticate(db, email, password);
  if (!user) return { error: "That email and password don't match.", email };
  if (user.totpEnabledAt) {
    // Password is right; the session only starts after the authenticator code.
    const { token, expiresAt } = await createLoginChallenge(db, user.id);
    (await cookies()).set(CHALLENGE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    const next = safeNext(fd.get("next"));
    redirect(next === "/" ? "/login/verify" : `/login/verify?next=${encodeURIComponent(next)}`);
  }
  await startSession(user.id);
  await withUser(user.id, (s) => audit(s, "user", "auth.login", undefined, { ip }));
  // Cheap housekeeping without a cron job: occasionally purge expired rows.
  if (Math.random() < 0.05) await Promise.allSettled([purgeExpiredSessions(db), purgeOldRateLimits(db)]);
  redirect(safeNext(fd.get("next")));
}

export type VerifyState = { error?: string; expired?: boolean } | null;

/** Second sign-in step: the authenticator code (or a backup code). */
export async function verifyLogin(_prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const db = getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, `mfa:ip:${ip}`, 20, 900);
  if (!limit.allowed) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value ?? "";
  const r = await completeLoginChallenge(db, token, String(fd.get("code") ?? "").slice(0, 40));
  if (!r.ok) {
    if (r.reason === "wrong") return { error: "That code didn't match. Try the newest code in your app." };
    jar.delete(CHALLENGE_COOKIE);
    return {
      expired: true,
      error: r.reason === "locked" ? "Too many wrong codes. Sign in again to get a fresh try." : "This sign-in expired. Please sign in again.",
    };
  }
  jar.delete(CHALLENGE_COOKIE);
  await startSession(r.userId);
  await withUser(r.userId, (s) => audit(s, "user", "auth.login", undefined, { ip, secondFactor: r.method }));
  redirect(safeNext(fd.get("next")));
}

export async function signup(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const db = getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, `signup:ip:${ip}`, 10, 3600);
  const email = String(fd.get("email") ?? "");
  if (!limit.allowed) return { error: "Too many accounts created from this network. Try again later.", email };
  const strength = checkPassword(String(fd.get("password") ?? ""), [String(fd.get("name") ?? ""), email]);
  if (!strength.ok) return { error: `Choose a stronger password. ${strength.message}`, email };
  try {
    const user = await registerUser(db, {
      name: String(fd.get("name") ?? ""),
      email,
      password: String(fd.get("password") ?? ""),
      timezone: String(fd.get("timezone") ?? "UTC"),
    });
    // New accounts start with first-run setup (existing accounts never see it).
    await updatePreferences(db, user.id, { onboarding: "pending" });
    await startSession(user.id);
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check the form.", email };
    if (e instanceof AuthError) return { error: e.message, email };
    throw e;
  }
  redirect("/welcome");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
