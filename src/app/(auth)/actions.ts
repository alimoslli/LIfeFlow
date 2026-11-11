"use server";
import { provisionalName } from "@/lib/provisional-name";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { DEVICE_COOKIE, DEVICE_TTL_MS, earnsRememberedDevice, isRememberedDevice, rememberDevice } from "@/server/auth/remembered-devices";
import { adminFor } from "@/server/auth/admin";
import { CHALLENGE_COOKIE, completeLoginChallenge, createLoginChallenge, issueLoginEmailCode } from "@/server/auth/two-factor";
import { emailConfig, sendEmail } from "@/server/integrations/email";
import { ZodError } from "zod";
import { clientIp, endSession, startSession } from "@/server/auth/current-user";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { purgeOldRateLimits, rateLimit } from "@/server/rate-limit";
import { purgeExpiredSessions } from "@/server/auth/sessions";
import { AuthError, authenticate, registerUser, updatePreferences } from "@/server/services/accounts";
import { checkPassword } from "@/lib/password-strength";
import { CHAT_COOKIE } from "@/lib/chat-session";
import { audit } from "@/server/services/audit";
import { consumePendingAppleLink } from "@/server/auth/apple";
import { passwordResetAvailable, requestPasswordReset, ResetError, resetPassword } from "@/server/auth/password-reset";
import { recordInvite } from "@/server/services/invites";
import { recordError } from "@/server/services/error-reports";

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
  if (user.suspendedAt) return { error: "This account has been suspended. Please contact support.", email };
  // Only after a correct password: a remembered phone (30 days) skips the second step. Never for the admin account.
  const remembered =
    !!user.totpEnabledAt && (await isRememberedDevice(db, user.id, (await cookies()).get(DEVICE_COOKIE)?.value)) && !(await adminFor(db, user.id));
  if (user.totpEnabledAt && !remembered) {
    // Password is right; the session only starts after the authenticator code.
    const { token, expiresAt } = await createLoginChallenge(db, user.id, "password");
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
  await startSession(user.id, { secondStepSkipped: remembered });
  const appleLinked = await consumePendingAppleLink(db, user.id);
  await withUser(user.id, (s) =>
    audit(s, "user", "auth.login", undefined, { ip, ...(remembered && { method: "remembered_device" }), ...(appleLinked && { appleLinked }) }),
  );
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
  // "Remember this phone for 30 days" (checked by default). Only the authenticator or a backup code earns it, never an emailed code, and never the admin account.
  if (fd.get("remember") === "on" && earnsRememberedDevice(r.method) && !(await adminFor(db, r.userId))) {
    const d = await rememberDevice(db, r.userId, (await headers()).get("user-agent"));
    jar.set(DEVICE_COOKIE, d.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: d.expiresAt,
      maxAge: DEVICE_TTL_MS / 1000,
    });
  }
  await consumePendingAppleLink(db, r.userId);
  await withUser(r.userId, (s) => audit(s, "user", "auth.login", undefined, { ip, secondFactor: r.method }));
  if (r.method === "email") after(() => noticeEmailSignIn(r.userId));
  redirect(safeNext(fd.get("next")));
}

export type EmailCodeState = { sentTo?: string; error?: string; expired?: boolean } | null;

/** "Email me a code": after the password step, sends a 6-digit code to the account's email (owner, 2026-11-06). */
export async function sendLoginEmailCode(_prev: EmailCodeState): Promise<EmailCodeState> {
  const cfg = emailConfig();
  if (!cfg) return { error: "Email codes aren't available yet. Use your app or a backup code." };
  const db = getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, `mfa-email:ip:${ip}`, 6, 3600);
  if (!limit.allowed) return { error: "Too many codes sent. Please wait a while and try again." };
  const jar = await cookies();
  const r = await issueLoginEmailCode(db, jar.get(CHALLENGE_COOKIE)?.value ?? "");
  if (!r.ok) {
    if (r.reason === "too_many") return { error: "We've sent 3 codes for this sign-in. Use the newest one, or sign in again." };
    if (r.reason === "not_password") return { error: "Email codes work after signing in with your email and password. Sign in that way to use one." };
    if (r.reason === "after_reset")
      return {
        error: "For safety, email codes are off after a password reset until you sign in once with your authenticator app, a backup code or a passkey.",
      };
    jar.delete(CHALLENGE_COOKIE);
    return { expired: true, error: "This sign-in expired. Please sign in again." };
  }
  // The sign-in now lasts as long as the code: keep the cookie alive with it.
  jar.set(CHALLENGE_COOKIE, jar.get(CHALLENGE_COOKIE)?.value ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: r.expiresAt,
  });
  try {
    await sendEmail(cfg, {
      to: r.email,
      subject: `${r.code} is your LifeFlow sign-in code`,
      text: `Your LifeFlow sign-in code is ${r.code}.\n\nIt works once, for 10 minutes. If you didn't just try to sign in, change your password.`,
      html: `<p>Your LifeFlow sign-in code is</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${r.code}</p><p>It works once, for 10 minutes. If you didn't just try to sign in, change your password.</p>`,
    });
  } catch (e) {
    await recordError(db, { source: "server", route: "/login/verify", message: `email code send failed: ${e instanceof Error ? e.name : "EmailError"}` }).catch(
      () => {},
    );
    return { error: "We couldn't send the email just now. Try again in a minute." };
  }
  return { sentTo: r.to };
}

/** Lets the person know an email code was used to sign in, so a sign-in they didn't make doesn't go unnoticed. */
async function noticeEmailSignIn(userId: string) {
  const cfg = emailConfig();
  if (!cfg) return;
  try {
    const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (!u) return;
    await sendEmail(cfg, {
      to: u.email,
      subject: "You signed in to LifeFlow with an email code",
      text: "You just signed in to LifeFlow with a code we emailed you. If this wasn't you, change your password now.",
      html: "<p>You just signed in to LifeFlow with a code we emailed you.</p><p>If this wasn't you, change your password now.</p>",
    });
  } catch {
    // A missed notice never blocks the sign-in.
  }
}

export async function signup(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const db = getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, `signup:ip:${ip}`, 10, 3600);
  const email = String(fd.get("email") ?? "");
  if (!limit.allowed) return { error: "Too many accounts created from this network. Try again later.", email };
  // Sign-up asks only for email and password. The name is asked on the first screen after (a placeholder from the email until then).
  const name = String(fd.get("name") ?? "").trim() || provisionalName(email);
  const strength = checkPassword(String(fd.get("password") ?? ""), [name, email]);
  if (!strength.ok) return { error: `Choose a stronger password. ${strength.message}`, email };
  try {
    const user = await registerUser(db, {
      name,
      email,
      password: String(fd.get("password") ?? ""),
      timezone: String(fd.get("timezone") ?? "UTC"),
    });
    // New accounts start with first-run setup (existing accounts never see it).
    await updatePreferences(db, user.id, { onboarding: "pending" });
    // Signed up from a friend's invite link: credit them. Never blocks sign-up.
    const invite = String(fd.get("invite") ?? "").slice(0, 32);
    if (invite) await recordInvite(db, user.id, invite).catch(() => false);
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
  // the chat you were in goes with the session (owner, 2026-11-11: "or sign out"); the earlier ones stay in the list
  (await cookies()).set(CHAT_COOKIE, "", { path: "/", maxAge: 0 });
  redirect("/login");
}

export type ForgotState = { sent?: boolean; error?: string; email?: string } | null;

/** Emails a reset link. Always answers the same way, whether or not the email has an account. */
export async function forgotPassword(_prev: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (!passwordResetAvailable()) return { error: "Password reset by email isn't available yet.", email };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you signed up with.", email };
  const db = getDb();
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(db, `reset:ip:${ip}`, 10, 900), rateLimit(db, `reset:email:${email}`, 3, 3600)]);
  if (!byIp.allowed) return { error: "Too many requests. Please wait a few minutes and try again.", email };
  // Over the per-email limit: answer as if sent, so the limit can't reveal whether the account exists.
  if (!byEmail.allowed) return { sent: true, email };
  // Links must point at the real site. The Host header is client-controlled, so production needs APP_URL.
  const appUrl = process.env.APP_URL?.trim() || (process.env.NODE_ENV !== "production" ? `http://${(await headers()).get("host")}` : "");
  if (!appUrl) {
    // Tell the owner (error alerts), never the visitor, which setting is missing.
    await recordError(db, { source: "server", route: "/forgot-password", message: "Password reset: APP_URL is not set" }).catch(() => {});
    return { error: "Password reset by email isn't available yet.", email };
  }
  try {
    await requestPasswordReset(db, email, appUrl);
  } catch (e) {
    // The provider's message never includes the address. The owner is emailed on the 1st, 10th and 100th failure.
    const why = e instanceof Error ? e.message : "unknown";
    console.error("password reset email failed", why);
    await recordError(db, { source: "server", route: "/forgot-password", message: `Password reset email failed: ${why}` }).catch(() => {});
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
