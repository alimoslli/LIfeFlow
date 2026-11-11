import { randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { keyedHash } from "../crypto";
import type { Database } from "../db/client";
import { emailConfirmations, users } from "../db/schema";
import { emailConfig, sendEmail, type EmailConfig } from "../integrations/email";
import { rateLimit } from "../rate-limit";
import { verifyEmail, type VerifyResult } from "./referrals";
import { lockQueue } from "./waitlist";

/**
 * "Confirm your email" (owner, 2026-11-11). A 6-digit code emailed to the account's own address, with the same rules as the
 * sign-in email code (ADR 0009 addendum): only a hash is kept and it is bound to the user, single use, 10 minutes, 5 wrong
 * tries, at most 3 sends an hour per person and a limit per network. It is reported as sent only with the provider's id.
 */

export const CONFIRM_CODE_TTL_MS = 10 * 60_000;
export const CONFIRM_MAX_ATTEMPTS = 5;
/** Every try counts per person per day, on top of the 5 per code, and a new code never resets it. */
export const CONFIRM_TRIES_PER_DAY = 10;
export const CONFIRM_SENDS_PER_HOUR = 3;
/**
 * Per-network limits are only a backstop (a campus or a school's shared address has many real students on it), so they're
 * generous: the per-person limits above are the real guard. Sign-up itself is 10 an hour per network, so a network can't
 * make many accounts to send to anyway.
 */
export const CONFIRM_SENDS_PER_IP_HOUR = 100;
export const CONFIRM_TRIES_PER_IP_15MIN = 300;

// Keyed (HMAC under a key derived from ENCRYPTION_KEY, its own label), so a stolen table can't be run against all million codes.
const codeHash = (userId: string, code: string) => keyedHash("email-confirm-code", `${userId}:${code}`);
const same = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

export type SendResult = { ok: true; id: string } | { ok: false; reason: "already" | "unavailable" | "too_many" | "failed" | "no_user" };
export type SendEmailFn = (cfg: EmailConfig, msg: Parameters<typeof sendEmail>[1]) => Promise<{ id: string }>;

/**
 * Makes a new code (replacing any earlier one) and emails it. `ip` is the caller's `clientIp()`. If the send fails the new
 * code is removed, so nothing unsent is ever waiting to be guessed.
 */
export async function sendConfirmCode(
  db: Database,
  userId: string,
  ip: string,
  deps: { send?: SendEmailFn; config?: EmailConfig | null; now?: number; /** tests only: a fixed code */ code?: () => string } = {},
): Promise<SendResult> {
  const cfg = deps.config === undefined ? emailConfig() : deps.config;
  if (!cfg) return { ok: false, reason: "unavailable" };
  const [u] = await db.select({ email: users.email, verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, reason: "no_user" };
  if (u.verifiedAt) return { ok: false, reason: "already" };
  const [byUser, byIp] = [
    await rateLimit(db, `email-confirm:send:user:${userId}`, CONFIRM_SENDS_PER_HOUR, 3600),
    await rateLimit(db, `email-confirm:send:ip:${ip}`, CONFIRM_SENDS_PER_IP_HOUR, 3600),
  ];
  if (!byUser.allowed || !byIp.allowed) return { ok: false, reason: "too_many" };
  const code = deps.code?.() ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date((deps.now ?? Date.now()) + CONFIRM_CODE_TTL_MS);
  const row = { codeHash: codeHash(userId, code), expiresAt, attempts: 0, createdAt: new Date(deps.now ?? Date.now()) };
  await db
    .insert(emailConfirmations)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: emailConfirmations.userId, set: row });
  try {
    const sent = await (deps.send ?? sendEmail)(cfg, {
      to: u.email,
      subject: `${code} is your LifeFlow confirmation code`,
      text: `Your LifeFlow code is ${code}.\n\nIt works once, for 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Your LifeFlow code is</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>It works once, for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    });
    if (!sent.id) throw new Error("no id");
    return { ok: true, id: sent.id };
  } catch {
    await db.delete(emailConfirmations).where(and(eq(emailConfirmations.userId, userId), eq(emailConfirmations.codeHash, row.codeHash)));
    return { ok: false, reason: "failed" };
  }
}

export type ConfirmResult = ({ ok: true } & VerifyResult) | { ok: false; reason: "wrong" | "expired" | "locked" | "too_many" };

/**
 * Checks the code. Each wrong try counts and the fifth removes the code. A right one is taken (deleted) and the email is
 * marked confirmed, crediting the inviter, in one transaction, so it works once and can't half-happen.
 */
export async function confirmEmailCode(db: Database, userId: string, code: string, ip: string, now = Date.now()): Promise<ConfirmResult> {
  const [byIp, byUser] = [
    await rateLimit(db, `email-confirm:try:ip:${ip}`, CONFIRM_TRIES_PER_IP_15MIN, 900),
    await rateLimit(db, `email-confirm:try:user:${userId}`, CONFIRM_TRIES_PER_DAY, 86400),
  ];
  if (!byIp.allowed || !byUser.allowed) return { ok: false, reason: "too_many" };
  const typed = code.replace(/\s/g, "");
  return db.transaction(async (tx) => {
    // The queue lock comes first in every transaction that may credit someone (see lockQueue), before the code row's lock.
    await lockQueue(tx);
    // Counting the try first (and locking the row) means parallel guesses can't beat the limit.
    const [c] = await tx
      .update(emailConfirmations)
      .set({ attempts: sql`${emailConfirmations.attempts} + 1` })
      .where(eq(emailConfirmations.userId, userId))
      .returning();
    if (!c || c.expiresAt.getTime() < now) {
      if (c) await tx.delete(emailConfirmations).where(eq(emailConfirmations.userId, userId));
      return { ok: false, reason: "expired" } as const;
    }
    if (c.attempts > CONFIRM_MAX_ATTEMPTS) {
      await tx.delete(emailConfirmations).where(eq(emailConfirmations.userId, userId));
      return { ok: false, reason: "locked" } as const;
    }
    const right = /^\d{6}$/.test(typed) && same(codeHash(userId, typed), c.codeHash);
    if (!right) {
      if (c.attempts >= CONFIRM_MAX_ATTEMPTS) {
        await tx.delete(emailConfirmations).where(eq(emailConfirmations.userId, userId));
        return { ok: false, reason: "locked" } as const;
      }
      return { ok: false, reason: "wrong" } as const;
    }
    const taken = await tx
      .delete(emailConfirmations)
      .where(and(eq(emailConfirmations.userId, userId), eq(emailConfirmations.codeHash, c.codeHash)))
      .returning({ id: emailConfirmations.userId });
    if (!taken.length) return { ok: false, reason: "expired" } as const;
    return { ok: true, ...(await verifyEmail(tx, userId, new Date(now))) } as const;
  });
}

/** Housekeeping for the daily run: codes past their 10 minutes are useless, so they go. Returns how many were removed. */
export async function purgeExpiredConfirmCodes(db: Database): Promise<number> {
  const gone = await db.delete(emailConfirmations).where(lt(emailConfirmations.expiresAt, new Date())).returning({ id: emailConfirmations.userId });
  return gone.length;
}
