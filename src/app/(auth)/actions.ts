"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { clientIp, endSession, startSession } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { purgeOldRateLimits, rateLimit } from "@/server/rate-limit";
import { purgeExpiredSessions } from "@/server/auth/sessions";
import { AuthError, authenticate, registerUser } from "@/server/services/accounts";
import { audit } from "@/server/services/audit";

export type AuthState = { error?: string; email?: string } | null;

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
};

export async function login(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const db = getDb();
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(db, `login:ip:${ip}`, 30, 900), rateLimit(db, `login:email:${email}`, 8, 900)]);
  if (!byIp.allowed || !byEmail.allowed) return { error: "Too many sign-in attempts. Please wait a few minutes and try again.", email };
  const user = await authenticate(db, email, password);
  if (!user) return { error: "That email and password don't match.", email };
  await startSession(user.id);
  await withUser(user.id, (s) => audit(s, "user", "auth.login", undefined, { ip }));
  // Cheap housekeeping without a cron job: occasionally purge expired rows.
  if (Math.random() < 0.05) await Promise.allSettled([purgeExpiredSessions(db), purgeOldRateLimits(db)]);
  redirect(safeNext(fd.get("next")));
}

export async function signup(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const db = getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, `signup:ip:${ip}`, 10, 3600);
  const email = String(fd.get("email") ?? "");
  if (!limit.allowed) return { error: "Too many accounts created from this network. Try again later.", email };
  try {
    const user = await registerUser(db, {
      name: String(fd.get("name") ?? ""),
      email,
      password: String(fd.get("password") ?? ""),
      timezone: String(fd.get("timezone") ?? "UTC"),
    });
    await startSession(user.id);
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check the form.", email };
    if (e instanceof AuthError) return { error: e.message, email };
    throw e;
  }
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
