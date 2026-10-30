import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users, type UserPreferences } from "../db/schema";
import { normalizePhone, sendSms, smsConfig, type SmsConfig } from "../integrations/twilio";
import { ServiceError } from "./errors";

/**
 * Texting Jarvis (ADR 0017). The user links a phone by entering a code we text it;
 * only that verified number reaches their account. These read and write the users
 * table directly because an incoming text has no session.
 */
type Sms = NonNullable<UserPreferences["sms"]>;
const CODE_MINUTES = 10;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

async function prefsOf(db: Database, userId: string) {
  const [u] = await db.select({ preferences: users.preferences, smsPhone: users.smsPhone }).from(users).where(eq(users.id, userId));
  if (!u) throw new ServiceError("Account not found.", "not_found");
  return u;
}

export async function setSms(db: Database, userId: string, patch: Partial<Sms>) {
  const u = await prefsOf(db, userId);
  await db
    .update(users)
    .set({ preferences: { ...u.preferences, sms: { ...u.preferences.sms, ...patch } } })
    .where(eq(users.id, userId));
}

export async function smsStatus(db: Database, userId: string) {
  const u = await prefsOf(db, userId);
  return { phone: u.smsPhone, pendingPhone: u.preferences.sms?.pendingPhone ?? null, money: u.preferences.sms?.money === true };
}

/** Texts a 6-digit code to the number. */
export async function startPhoneLink(db: Database, userId: string, raw: string, cfg: SmsConfig | null = smsConfig(), fetchImpl?: typeof fetch) {
  if (!cfg) throw new ServiceError("Texting isn't available yet.");
  const phone = normalizePhone(raw);
  if (!phone) throw new ServiceError("Enter your mobile number, like (404) 555-0134 or +44 7700 900123.");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.smsPhone, phone));
  if (taken && taken.id !== userId) throw new ServiceError("That number is linked to another account.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await setSms(db, userId, {
    pendingPhone: phone,
    codeHash: hash(code),
    codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
  });
  await sendSms(cfg, phone, `Your LifeFlow code is ${code}. It expires in ${CODE_MINUTES} minutes.`, fetchImpl);
  return phone;
}

export async function verifyPhoneLink(db: Database, userId: string, code: string) {
  const u = await prefsOf(db, userId);
  const s = u.preferences.sms;
  if (!s?.pendingPhone || !s.codeHash || !s.codeExpiresAt) throw new ServiceError("Send a code first.");
  if (new Date(s.codeExpiresAt) < new Date() || (s.attempts ?? 0) >= 5) throw new ServiceError("That code expired. Send a new one.");
  const ok = timingSafeEqual(Buffer.from(hash(code.trim())), Buffer.from(s.codeHash));
  if (!ok) {
    await setSms(db, userId, { attempts: (s.attempts ?? 0) + 1 });
    throw new ServiceError("That code doesn't match.");
  }
  const phone = s.pendingPhone;
  await db
    .update(users)
    .set({ smsPhone: phone, preferences: { ...u.preferences, sms: { money: s.money, conversationId: s.conversationId } } })
    .where(eq(users.id, userId));
  return phone;
}

export async function unlinkPhone(db: Database, userId: string) {
  const u = await prefsOf(db, userId);
  await db
    .update(users)
    .set({ smsPhone: null, preferences: { ...u.preferences, sms: { money: u.preferences.sms?.money } } })
    .where(eq(users.id, userId));
}

/** The account a verified number belongs to, or null (unknown numbers get no reply). */
export async function userForPhone(db: Database, raw: string) {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.smsPhone, phone));
  return u?.id ?? null;
}

/** "yes", "Yes!", "y", "confirm" → confirm; "no", "cancel" → cancel. Anything else is a normal message. */
export function smsDecision(text: string): "confirm" | "cancel" | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (["yes", "y", "confirm", "ok", "do it"].includes(t)) return "confirm";
  if (["no", "n", "cancel", "don't", "dont"].includes(t)) return "cancel";
  return null;
}
