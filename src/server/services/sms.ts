import { randomInt, timingSafeEqual } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { smsInbound, users, type UserPreferences } from "../db/schema";
import { normalizePhone, sendSms, smsConfig, type SmsConfig } from "../integrations/twilio";
import { keyedHash } from "../crypto";
import { rateLimit } from "../rate-limit";
import { ServiceError } from "./errors";
import { appOpenFor } from "./waitlist";

/**
 * Texting Jarvis (ADR 0017). The user links a phone by entering a code we text it;
 * only that verified number reaches their account. These read and write the users
 * table directly because an incoming text has no session.
 */
type Sms = NonNullable<UserPreferences["sms"]>;
const CODE_MINUTES = 10;
const SENDS_PER_ACCOUNT_HOUR = 5;
const SENDS_PER_NUMBER_HOUR = 3;
const TRIES_PER_CODE = 5;
const TRIES_PER_ACCOUNT_HOUR = 10;
/** A keyed hash bound to the account and number, so a leaked row can't be brute-forced offline and a code works only where it was sent. */
const hash = (userId: string, phone: string, code: string) => keyedHash("sms-link-code", `${userId}:${phone}:${code}`);
const CLASH = "That number can't be linked. Try a different one.";

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
  // Limits count first, for every number, so checking numbers one after another is limited (the number key is hashed, never the digits).
  if (!(await rateLimit(db, `sms-link:send:user:${userId}`, SENDS_PER_ACCOUNT_HOUR, 3600)).allowed)
    throw new ServiceError("Too many codes sent. Try again in an hour.");
  if (!(await rateLimit(db, `sms-link:send:phone:${keyedHash("sms-link-phone", phone)}`, SENDS_PER_NUMBER_HOUR, 3600)).allowed)
    throw new ServiceError("Too many codes sent to that number. Try again in an hour.");
  // A number linked to another account answers exactly like a free one but sends nothing, so nobody can tell them apart;
  // the code never reaches anyone, so verify fails as a wrong code, and verify re-checks the number before linking.
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.smsPhone, phone));
  const linkedElsewhere = !!taken && taken.id !== userId;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await setSms(db, userId, {
    pendingPhone: phone,
    codeHash: hash(userId, phone, code),
    codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
  });
  if (linkedElsewhere) return phone;
  await sendSms(cfg, phone, `Your LifeFlow code is ${code}. It expires in ${CODE_MINUTES} minutes.`, fetchImpl);
  return phone;
}

export async function verifyPhoneLink(db: Database, userId: string, code: string) {
  const u = await prefsOf(db, userId);
  const s = u.preferences.sms;
  if (!s?.pendingPhone || !s.codeHash || !s.codeExpiresAt) throw new ServiceError("Send a code first.");
  if (new Date(s.codeExpiresAt) < new Date()) throw new ServiceError("That code expired. Send a new one.");
  // One conditional UPDATE counts each guess against this code (attempts < 5), so parallel guesses can't pass 5 and no clock edge adds more.
  const counted = await db
    .update(users)
    .set({
      preferences: sql`jsonb_set(${users.preferences}, '{sms,attempts}', to_jsonb(coalesce((${users.preferences}->'sms'->>'attempts')::int, 0) + 1))`,
    })
    .where(
      sql`${users.id} = ${userId} and ${users.preferences}->'sms'->>'codeHash' = ${s.codeHash} and coalesce((${users.preferences}->'sms'->>'attempts')::int, 0) < ${TRIES_PER_CODE}`,
    )
    .returning({ id: users.id });
  if (counted.length === 0) throw new ServiceError("Too many tries. Wait a few minutes and send a new code.");
  // A new code starts its own 5, so the account also has an hourly cap on all guesses.
  if (!(await rateLimit(db, `sms-link:try:user:${userId}`, TRIES_PER_ACCOUNT_HOUR, 3600)).allowed)
    throw new ServiceError("Too many tries. Wait a few minutes and send a new code.");
  const phone = s.pendingPhone;
  const ok = timingSafeEqual(Buffer.from(hash(userId, phone, code.trim())), Buffer.from(s.codeHash));
  if (!ok) throw new ServiceError("That code doesn't match.");
  // The number must still be free now (someone else may have linked it since the code went out).
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.smsPhone, phone));
  if (taken && taken.id !== userId) throw new ServiceError(CLASH);
  try {
    await db
      .update(users)
      .set({ smsPhone: phone, preferences: { ...u.preferences, sms: { money: s.money, conversationId: s.conversationId } } })
      .where(eq(users.id, userId));
  } catch (e) {
    // Only the unique violation (the number was linked meanwhile) reads as the clash; real errors must reach error_reports.
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") throw new ServiceError(CLASH);
    throw e;
  }
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
  // someone on the waitlist gets no reply until they're let in (services/waitlist.ts)
  if (!u || !(await appOpenFor(db, u.id))) return null;
  return u.id;
}

/**
 * "yes", "Yes!", "y", "confirm" → confirm; "no", "don't" → cancel. Anything else is a normal message.
 * Never "cancel" or "stop": carriers treat those as unsubscribing from every text (see smsKeyword).
 */
export function smsDecision(text: string): "confirm" | "cancel" | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (["yes", "y", "confirm", "ok", "do it"].includes(t)) return "confirm";
  if (["no", "n", "don't", "dont", "nope"].includes(t)) return "cancel";
  return null;
}

/** The standard carrier keywords (CTIA): Twilio blocks texts after STOP and re-allows them after START. */
const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt out"];
export function smsKeyword(text: string): "stop" | "start" | "help" | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (STOP_WORDS.includes(t)) return "stop";
  if (t === "start" || t === "unstop") return "start";
  if (t === "help" || t === "info") return "help";
  return null;
}

export function smsHelpText(contactEmail: string | null) {
  return `LifeFlow: text your skyling about your plans, school, work and money. Manage texts in the app under Settings, Text your skyling.${
    contactEmail ? ` Help: ${contactEmail}.` : ""
  } Msg & data rates may apply. Reply STOP to opt out.`;
}

/**
 * Claims a provider message id (Twilio's MessageSid) before answering. True the first time, false for a retry of the same text,
 * decided by one atomic insert, so two deliveries at once can't both run a turn. Old ids are cleared by the daily cron (purgeOldSmsInbound).
 */
export async function claimInboundSms(db: Database, messageSid: string): Promise<boolean> {
  const rows = await db.insert(smsInbound).values({ messageSid }).onConflictDoNothing().returning({ sid: smsInbound.messageSid });
  return rows.length > 0;
}

/** Daily housekeeping: provider message ids older than a week (providers retry within minutes). */
export async function purgeOldSmsInbound(db: Database) {
  await db.delete(smsInbound).where(lt(smsInbound.createdAt, new Date(Date.now() - 7 * 86_400_000)));
}
