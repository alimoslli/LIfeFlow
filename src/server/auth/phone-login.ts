import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { phoneCodes, users } from "../db/schema";
import { emailConfig, sendEmail, type EmailConfig } from "../integrations/email";
import { normalizePhone, sendSms, smsConfig, type SmsConfig } from "../integrations/twilio";
import { ServiceError } from "../services/errors";

/**
 * Sign in with a phone number (optional, owner 2026-11-08). A 6-digit code goes to the number by text; until texting is set up it goes to the
 * account's email instead, and the screen says so. The number is stored as `login_phone`, never `sms_phone`: a number proven only by an
 * emailed code must not receive or send texts. Sign-in never reveals whether a number has an account.
 */
export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
/** At most this many codes per number per hour. */
export const MAX_SENDS_PER_HOUR = 3;

const hash = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export type Via = "text" | "email";
export type Channels = { sms: SmsConfig | null; email: EmailConfig | null; fetchImpl?: typeof fetch };

/** How a code would travel right now: by text when texting is set up, otherwise by email, otherwise not at all. */
export function codeChannel(c: Channels = { sms: smsConfig(), email: emailConfig() }): Via | null {
  return c.sms ? "text" : c.email ? "email" : null;
}

const smsBody = (code: string, appUrl: string) => `Your LifeFlow code is ${code}. It expires in ${CODE_MINUTES} minutes.\n\n@${new URL(appUrl).host} #${code}`;

async function deliver(c: Channels, to: { phone: string; email: string }, code: string): Promise<Via> {
  if (c.sms) {
    await sendSms(c.sms, to.phone, smsBody(code, c.sms.appUrl), c.fetchImpl);
    return "text";
  }
  if (c.email) {
    await sendEmail(
      c.email,
      {
        to: to.email,
        subject: `${code} is your LifeFlow sign-in code`,
        text: `Your LifeFlow code is ${code}.\n\nIt works once, for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
        html: `<p>Your LifeFlow code is <strong style="font-size:20px">${code}</strong>.</p><p>It works once, for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`,
      },
      c.fetchImpl,
    );
    return "email";
  }
  throw new ServiceError("Phone codes aren't available yet.");
}

async function issue(db: Database, c: Channels, user: { id: string; email: string }, phone: string, purpose: "link" | "login", now: Date) {
  await db.delete(phoneCodes).where(lt(phoneCodes.expiresAt, now));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomUUID();
  // The code is saved first, then sent; a failed send removes it so a code nobody received can't be guessed at.
  await db.insert(phoneCodes).values({
    id,
    userId: user.id,
    phone,
    purpose,
    codeHash: hash(id, code),
    expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000),
    via: codeChannel(c) ?? "email",
  });
  try {
    return await deliver(c, { phone, email: user.email }, code);
  } catch (e) {
    await db.delete(phoneCodes).where(eq(phoneCodes.id, id));
    throw e;
  }
}

const sentLastHour = async (db: Database, phone: string, purpose: "link" | "login", now: Date) =>
  (
    await db
      .select({ id: phoneCodes.id })
      .from(phoneCodes)
      .where(and(eq(phoneCodes.phone, phone), eq(phoneCodes.purpose, purpose), gte(phoneCodes.createdAt, new Date(now.getTime() - 3600_000))))
  ).length;

async function check(db: Database, phone: string, purpose: "link" | "login", code: string, now: Date) {
  const [row] = await db
    .select()
    .from(phoneCodes)
    .where(and(eq(phoneCodes.phone, phone), eq(phoneCodes.purpose, purpose)))
    .orderBy(desc(phoneCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt <= now || row.attempts >= MAX_ATTEMPTS) return null;
  if (!same(hash(row.id, code.trim()), row.codeHash)) {
    await db
      .update(phoneCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(phoneCodes.id, row.id));
    return null;
  }
  await db.delete(phoneCodes).where(and(eq(phoneCodes.phone, phone), eq(phoneCodes.purpose, purpose)));
  return row;
}

// ------------------------------------------------------------------ sign in

/**
 * Sends a sign-in code if the number is on an account. Says nothing about whether it was: a number with no account, a suspended account,
 * too many codes this hour, and an email code after a password reset all end the same way, so this can't be used to look up who has an account.
 */
export async function startPhoneSignIn(db: Database, raw: string, c: Channels = { sms: smsConfig(), email: emailConfig() }, now = new Date()) {
  const phone = normalizePhone(raw);
  if (!phone) throw new ServiceError("Enter your mobile number, like (404) 555-0134 or +44 7700 900123.");
  const via = codeChannel(c);
  if (!via) throw new ServiceError("Phone codes aren't available yet.");
  const [u] = await db
    .select({ id: users.id, email: users.email, suspendedAt: users.suspendedAt, emailCodesBlockedAt: users.emailCodesBlockedAt })
    .from(users)
    .where(eq(users.loginPhone, phone));
  if (!u || u.suspendedAt) return via;
  // An emailed code is an email sign-in: it stays off after a password reset, like the other email codes.
  if (via === "email" && u.emailCodesBlockedAt) return via;
  if ((await sentLastHour(db, phone, "login", now)) >= MAX_SENDS_PER_HOUR) return via;
  try {
    await issue(db, c, u, phone, "login", now);
  } catch (e) {
    console.error("[phone sign-in] code not sent", e instanceof Error ? e.name : "error");
  }
  return via;
}

export type PhoneSignInResult = { ok: true; userId: string } | { ok: false; reason: "wrong" | "locked" };

/** Checks the code. Unknown numbers, wrong, expired and used codes all answer "wrong". */
export async function finishPhoneSignIn(db: Database, raw: string, code: string, now = new Date()): Promise<PhoneSignInResult> {
  const phone = normalizePhone(raw);
  if (!phone || !/^\d{6}$/.test(code.replace(/\s/g, ""))) return { ok: false, reason: "wrong" };
  const [u] = await db.select({ id: users.id, suspendedAt: users.suspendedAt }).from(users).where(eq(users.loginPhone, phone));
  if (!u || u.suspendedAt) return { ok: false, reason: "wrong" };
  const row = await check(db, phone, "login", code.replace(/\s/g, ""), now);
  return row && row.userId === u.id ? { ok: true, userId: u.id } : { ok: false, reason: "wrong" };
}

// ------------------------------------------------------------------ add or remove (signed in)

/** Sends a code to a number the signed-in person wants to sign in with. */
export async function startAddLoginPhone(
  db: Database,
  userId: string,
  raw: string,
  c: Channels = { sms: smsConfig(), email: emailConfig() },
  now = new Date(),
) {
  const phone = normalizePhone(raw);
  if (!phone) throw new ServiceError("Enter your mobile number, like (404) 555-0134 or +44 7700 900123.");
  if (!codeChannel(c)) throw new ServiceError("Phone codes aren't available yet.");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.loginPhone, phone));
  if (taken && taken.id !== userId) throw new ServiceError("That number is already used to sign in to another account.");
  const [me] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId));
  if (!me) throw new ServiceError("Account not found.", "not_found");
  if ((await sentLastHour(db, phone, "link", now)) >= MAX_SENDS_PER_HOUR) throw new ServiceError("Too many codes for that number. Try again in an hour.");
  const via = await issue(db, c, me, phone, "link", now).catch((e) => {
    if (e instanceof ServiceError) throw e;
    throw new ServiceError("The code couldn't be sent. Try again in a minute.");
  });
  return { phone, via };
}

export async function confirmAddLoginPhone(db: Database, userId: string, raw: string, code: string, now = new Date()) {
  const phone = normalizePhone(raw);
  const row = phone ? await check(db, phone, "link", code.replace(/\s/g, ""), now) : null;
  if (!phone || !row || row.userId !== userId) throw new ServiceError("That code doesn't match, or it expired. Send a new one.");
  await db.update(users).set({ loginPhone: phone, loginPhoneVia: row.via }).where(eq(users.id, userId));
  return phone;
}

export async function removeLoginPhone(db: Database, userId: string) {
  await db.update(users).set({ loginPhone: null, loginPhoneVia: null }).where(eq(users.id, userId));
}

/** "+1•••••0134": enough to recognise the number. */
export const maskPhone = (phone: string) => `${phone.slice(0, 2)}${"•".repeat(Math.max(0, phone.length - 6))}${phone.slice(-4)}`;
