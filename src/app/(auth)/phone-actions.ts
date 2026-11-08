"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { clientIp, startSession } from "@/server/auth/current-user";
import { consumePendingAppleLink } from "@/server/auth/apple";
import { codeChannel, finishPhoneSignIn, startPhoneSignIn, type Via } from "@/server/auth/phone-login";
import { CHALLENGE_COOKIE, createLoginChallenge } from "@/server/auth/two-factor";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";
import { normalizePhone } from "@/server/integrations/twilio";

export type PhoneState = { step?: "code"; phone?: string; via?: Via; error?: string } | null;

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
};

/** Step one: asks for a code to be sent to the number. The answer is the same whether or not the number is on an account. */
export async function sendPhoneCode(_prev: PhoneState, fd: FormData): Promise<PhoneState> {
  const raw = String(fd.get("phone") ?? "").slice(0, 40);
  const db = getDb();
  const ip = await clientIp();
  const phone = normalizePhone(raw);
  const [byIp, byPhone] = await Promise.all([rateLimit(db, `phone-code:ip:${ip}`, 10, 3600), rateLimit(db, `phone-code:num:${phone ?? "x"}`, 6, 3600)]);
  if (!byIp.allowed || !byPhone.allowed) return { error: "Too many codes requested. Please wait a while and try again." };
  try {
    const via = await startPhoneSignIn(db, raw);
    return { step: "code", phone: phone!, via };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
}

/** Step two: the code. Right code and no two-step: signed in. With two-step on, the usual second step follows. */
export async function verifyPhoneCode(_prev: PhoneState, fd: FormData): Promise<PhoneState> {
  const raw = String(fd.get("phone") ?? "").slice(0, 40);
  const db = getDb();
  const ip = await clientIp();
  const [byIp, byPhone] = await Promise.all([
    rateLimit(db, `phone-verify:ip:${ip}`, 20, 900),
    rateLimit(db, `phone-verify:num:${normalizePhone(raw) ?? "x"}`, 12, 900),
  ]);
  const via = codeChannel() ?? undefined;
  if (!byIp.allowed || !byPhone.allowed) return { step: "code", phone: raw, via, error: "Too many attempts. Please wait a few minutes and try again." };
  const r = await finishPhoneSignIn(db, raw, String(fd.get("code") ?? "").slice(0, 12));
  if (!r.ok) return { step: "code", phone: raw, via, error: "That code didn't match, or it expired. Check the newest one, or send a new code." };
  const [u] = await db.select({ totpEnabledAt: users.totpEnabledAt }).from(users).where(eq(users.id, r.userId));
  const next = safeNext(fd.get("next"));
  if (u?.totpEnabledAt) {
    const { token, expiresAt } = await createLoginChallenge(db, r.userId, "phone");
    (await cookies()).set(CHALLENGE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    redirect(next === "/" ? "/login/verify" : `/login/verify?next=${encodeURIComponent(next)}`);
  }
  await startSession(r.userId);
  await consumePendingAppleLink(db, r.userId);
  await withUser(r.userId, (s) => audit(s, "user", "auth.login", undefined, { ip, method: "phone" }));
  redirect(next);
}
