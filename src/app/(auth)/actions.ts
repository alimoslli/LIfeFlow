"use server";
import { cookies, headers } from "next/headers";
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
import { consumePendingAppleLink } from "@/server/auth/apple";
import { passwordResetAvailable, requestPasswordReset, ResetError, resetPassword } from "@/server/auth/password-reset";

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
  const appleLinked = await consumePendingAppleLink(db, user.id);
  await withUser(user.id, (s) => audit(s, "user", "auth.login", undefined, { ip, ...(appleLinked && { appleLinked }) }));
  // Offer Face ID / Touch ID next time (the app shows the prompt once if this device supports it).
  (await cookies()).set("lf_offer_passkey", "1", { path: "/", maxAge: 600, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
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
  await consumePendingAppleLink(db, r.userId);
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

export type ForgotState = { sent?: boolean; error?: string; email?: string } | null;

/** Emails a reset link. Always answers the same way, whether or not the email has an account. */
export async function forgotPassword(_prev: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (!passwordResetAvailable()) return { error: "Password reset emails aren't set up on this server yet.", email };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you signed up with.", email };
  const db = getDb();
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(db, `reset:ip:${ip}`, 10, 900), rateLimit(db, `reset:email:${email}`, 3, 3600)]);
  if (!byIp.allowed) return { error: "Too many requests. Please wait a few minutes and try again.", email };
  // Over the per-email limit: answer as if sent, so the limit can't reveal whether the account exists.
  if (!byEmail.allowed) return { sent: true, email };
  // Links must point at the real site. The Host header is client-controlled, so production needs APP_URL.
  const appUrl = process.env.APP_URL?.trim() || (process.env.NODE_ENV !== "production" ? `http://${(await headers()).get("host")}` : "");
  if (!appUrl) return { error: "Password reset isn't fully set up on this server (APP_URL is missing).", email };
  try {
    await requestPasswordReset(db, email, appUrl);
  } catch (e) {
    console.error("password reset email failed", e instanceof Error ? e.name : "unknown");
    return { error: "We couldn't send the email just now. Please try again in a few minutes.", email };
  }
  return { sent: true, email };
}

export type ResetState = { error?: string } | null;

export async function resetPasswordAction(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const db = getDb();
  const limit = await rateLimit(db, `reset-use:ip:${await clientIp()}`, 20, 900);
  if (!limit.allowed) return { error: "Too many attempts. Please wait a few minutes and try again." };
  try {
    await resetPassword(db, String(fd.get("token") ?? ""), String(fd.get("password") ?? ""));
  } catch (e) {
    if (e instanceof ResetError) return { error: e.message };
    throw e;
  }
  redirect("/login?reset=1");
}
