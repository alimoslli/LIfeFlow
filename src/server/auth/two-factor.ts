import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import type { Database } from "../db/client";
import { loginChallenges, recoveryCodes, users } from "../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { verifyPassword } from "./password";

/**
 * Two-step sign-in with an authenticator app (TOTP, RFC 6238) plus one-time
 * backup codes.
 *
 * - The TOTP secret is stored AES-GCM encrypted (ENCRYPTION_KEY).
 * - A code is accepted once: the last used 30-second step is remembered.
 * - Backup codes are random and stored only as SHA-256 hashes; each works once.
 * - After the password step, a short-lived challenge (hashed token in a cookie,
 *   5 attempts, 10 minutes) stands in for the session until the code is right.
 */

export class TwoFactorError extends Error {}

export const CHALLENGE_COOKIE = "bf_mfa";
export const CHALLENGE_TTL_MS = 10 * 60_000;
export const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;
const PERIOD = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const totpFor = (secretB32: string, label = "LifeFlow") =>
  new TOTP({ issuer: "LifeFlow", label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: Secret.fromBase32(secretB32) });
const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export function twoFactorAvailable(): boolean {
  const k = process.env.ENCRYPTION_KEY;
  return !!k && Buffer.from(k, "base64").length === 32;
}

/**
 * Checks a 6-digit code against the secret, allowing one step of clock drift,
 * and refusing any step at or before the last one used (replay).
 * Returns the accepted step, or null.
 */
export function checkTotp(secretB32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totpFor(secretB32).validate({ token, window: 1, timestamp: now });
  if (delta == null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastStep != null && step <= lastStep) return null;
  return step;
}

async function getUser(db: Database, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new TwoFactorError("Account not found.");
  return u;
}

export async function twoFactorStatus(db: Database, userId: string) {
  const u = await getUser(db, userId);
  const [{ left }] = await db
    .select({ left: sql<number>`count(*)::int` })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return { enabled: !!u.totpEnabledAt, enabledAt: u.totpEnabledAt, recoveryCodesLeft: left, available: twoFactorAvailable() };
}

/** Step 1 of turning it on: a new secret (not active yet) and the otpauth:// URI for the QR code. */
export async function beginTotpSetup(db: Database, userId: string) {
  if (!twoFactorAvailable()) throw new TwoFactorError("Two-step sign-in isn't available yet.");
  const u = await getUser(db, userId);
  if (u.totpEnabledAt) throw new TwoFactorError("Two-step sign-in is already on.");
  const secret = new Secret({ size: 20 }).base32;
  await db
    .update(users)
    .set({ totpSecret: encryptSecret(secret), totpLastStep: null })
    .where(eq(users.id, userId));
  return { secret, uri: totpFor(secret, u.email).toString() };
}

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(8).toString("hex").slice(0, 10); // 40 bits each
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

async function replaceRecoveryCodes(db: Database, userId: string) {
  const codes = newRecoveryCodes();
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: sha256(normalizeRecovery(c)) })));
  return codes;
}

/** Step 2: the user proves the app works by entering a code. Returns backup codes (shown once). */
export async function confirmTotpSetup(db: Database, userId: string, code: string, now = Date.now()) {
  const u = await getUser(db, userId);
  if (u.totpEnabledAt) throw new TwoFactorError("Two-step sign-in is already on.");
  if (!u.totpSecret) throw new TwoFactorError("Start setup first.");
  const step = checkTotp(decryptSecret(u.totpSecret), code, null, now);
  if (step == null) throw new TwoFactorError("That code didn't match. Check the time on your phone and try the newest code.");
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(now), totpLastStep: step })
    .where(eq(users.id, userId));
  return { recoveryCodes: await replaceRecoveryCodes(db, userId) };
}

/** Accepts a current authenticator code or an unused backup code for an enabled account. */
export async function verifySecondFactor(db: Database, userId: string, code: string, now = Date.now()): Promise<"totp" | "recovery" | null> {
  const u = await getUser(db, userId);
  if (!u.totpEnabledAt || !u.totpSecret) return null;
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(code)) {
    const step = checkTotp(decryptSecret(u.totpSecret), code, u.totpLastStep, now);
    if (step == null) return null;
    // Conditional update so two simultaneous requests can't both use the same code.
    const updated = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, userId), sql`coalesce(${users.totpLastStep}, -1) < ${step}`))
      .returning({ id: users.id });
    return updated.length ? "totp" : null;
  }
  const hash = sha256(normalizeRecovery(code));
  const used = await db
    .update(recoveryCodes)
    .set({ usedAt: new Date(now) })
    .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, hash), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id });
  return used.length ? "recovery" : null;
}

/** Turning it off needs the password and a current code (or backup code). */
export async function disableTwoFactor(db: Database, userId: string, password: string, code: string, now = Date.now()) {
  const u = await getUser(db, userId);
  if (!u.totpEnabledAt) throw new TwoFactorError("Two-step sign-in is already off.");
  if (!(await verifyPassword(password, u.passwordHash))) throw new TwoFactorError("Password is incorrect.");
  if (!(await verifySecondFactor(db, userId, code, now))) throw new TwoFactorError("That code didn't match.");
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, userId));
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
}

export async function regenerateRecoveryCodes(db: Database, userId: string, code: string, now = Date.now()) {
  if (!(await verifySecondFactor(db, userId, code, now))) throw new TwoFactorError("That code didn't match.");
  return replaceRecoveryCodes(db, userId);
}

// ---------------------------------------------------------------------------
// Sign-in challenge (between the password and the code)

export async function createLoginChallenge(db: Database, userId: string, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, new Date(now)));
  await db.insert(loginChallenges).values({ id: sha256(token), userId, expiresAt: new Date(now + CHALLENGE_TTL_MS) });
  return { token, expiresAt: new Date(now + CHALLENGE_TTL_MS) };
}

export type ChallengeResult = { ok: true; userId: string; method: "totp" | "recovery" } | { ok: false; reason: "expired" | "wrong" | "locked" };

/** Checks the code for a pending sign-in. Each wrong try counts; after 5 the challenge is gone. */
export async function completeLoginChallenge(db: Database, token: string, code: string, now = Date.now()): Promise<ChallengeResult> {
  if (!token || token.length > 100) return { ok: false, reason: "expired" };
  const id = sha256(token);
  const [c] = await db.select().from(loginChallenges).where(eq(loginChallenges.id, id));
  if (!c || c.expiresAt.getTime() < now) return { ok: false, reason: "expired" };
  const [bumped] = await db
    .update(loginChallenges)
    .set({ attempts: sql`${loginChallenges.attempts} + 1` })
    .where(eq(loginChallenges.id, id))
    .returning({ attempts: loginChallenges.attempts });
  if (bumped.attempts > MAX_CHALLENGE_ATTEMPTS) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return { ok: false, reason: "locked" };
  }
  const method = await verifySecondFactor(db, c.userId, code, now);
  if (!method) {
    if (bumped.attempts < MAX_CHALLENGE_ATTEMPTS) return { ok: false, reason: "wrong" };
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    return { ok: false, reason: "locked" };
  }
  await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
  return { ok: true, userId: c.userId, method };
}
