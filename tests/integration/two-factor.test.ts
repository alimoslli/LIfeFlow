import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { closeDb, getDb } from "@/server/db/client";
import { loginChallenges, passwordResets, users } from "@/server/db/schema";
import {
  beginTotpSetup,
  beginTwoFactorRestart,
  checkTotp,
  completeLoginChallenge,
  confirmTotpSetup,
  createLoginChallenge,
  disableTwoFactor,
  finishTwoFactorRestart,
  issueLoginEmailCode,
  maskEmail,
  MAX_CHALLENGE_ATTEMPTS,
  MAX_EMAIL_SENDS,
  regenerateRecoveryCodes,
  twoFactorStatus,
  verifySecondFactor,
} from "@/server/auth/two-factor";
import { createHash, randomBytes } from "node:crypto";
import { resetPassword } from "@/server/auth/password-reset";
import { createSession, validateSession } from "@/server/auth/sessions";
import { changePassword } from "@/server/services/accounts";
import { makeUser } from "../helpers";

afterAll(closeDb);

const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);
const code = (secret: string, at: number) =>
  new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({ timestamp: at });

async function enabledUser() {
  const { user } = await makeUser("Two Factor");
  const db = getDb();
  const { secret, uri } = await beginTotpSetup(db, user.id);
  const { recoveryCodes } = await confirmTotpSetup(db, user.id, code(secret, T0), T0);
  return { user, db, secret, uri, recoveryCodes };
}

describe("authenticator codes", () => {
  it("accepts the current code, allows one step of clock drift, rejects others", () => {
    const secret = new Secret({ size: 20 }).base32;
    expect(checkTotp(secret, code(secret, T0), null, T0)).not.toBeNull();
    expect(checkTotp(secret, code(secret, T0 - 30_000), null, T0)).not.toBeNull();
    expect(checkTotp(secret, code(secret, T0 - 120_000), null, T0)).toBeNull();
    expect(checkTotp(secret, "12345", null, T0)).toBeNull();
    expect(checkTotp(secret, "abcdef", null, T0)).toBeNull();
  });
});

describe("turning two-step sign-in on", () => {
  it("stores the secret encrypted and only activates after a correct code", async () => {
    const { user } = await makeUser();
    const db = getDb();
    const { secret, uri } = await beginTotpSetup(db, user.id);
    expect(uri).toMatch(/^otpauth:\/\/totp\/LifeFlow:/);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.totpSecret).toMatch(/^v1\./);
    expect(row.totpSecret).not.toContain(secret);
    expect((await twoFactorStatus(db, user.id)).enabled).toBe(false);
    await expect(confirmTotpSetup(db, user.id, "000000", T0)).rejects.toThrow(/didn't match/);
    const { recoveryCodes } = await confirmTotpSetup(db, user.id, code(secret, T0), T0);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    expect(await twoFactorStatus(db, user.id)).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
  });
});

describe("second step at sign-in", () => {
  it("never accepts the same code twice (replay)", async () => {
    const { user, db, secret } = await enabledUser();
    const next = code(secret, T0 + 30_000);
    expect(await verifySecondFactor(db, user.id, next, T0 + 30_000)).toBe("totp");
    expect(await verifySecondFactor(db, user.id, next, T0 + 31_000)).toBeNull();
    // The code used to turn it on can't be replayed either.
    expect(await verifySecondFactor(db, user.id, code(secret, T0), T0 + 5_000)).toBeNull();
  });

  it("backup codes work once each, with or without the dash", async () => {
    const { user, db, recoveryCodes } = await enabledUser();
    expect(await verifySecondFactor(db, user.id, recoveryCodes[0].replace("-", "").toUpperCase(), T0)).toBe("recovery");
    expect(await verifySecondFactor(db, user.id, recoveryCodes[0], T0)).toBeNull();
    expect((await twoFactorStatus(db, user.id)).recoveryCodesLeft).toBe(9);
  });

  it("a challenge allows a few tries, then locks", async () => {
    const { user, db, secret } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    for (let i = 1; i < MAX_CHALLENGE_ATTEMPTS; i++)
      expect(await completeLoginChallenge(db, token, "000000", T0 + 60_000)).toEqual({ ok: false, reason: "wrong" });
    expect(await completeLoginChallenge(db, token, "000000", T0 + 60_000)).toEqual({ ok: false, reason: "locked" });
    // Even the right code no longer works on a locked challenge.
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("a correct code completes the challenge once; expired or forged tokens fail", async () => {
    const { user, db, secret } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    expect(await completeLoginChallenge(db, "forged-token", code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: false, reason: "expired" });
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: true, userId: user.id, method: "totp" });
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 90_000), T0 + 90_000)).toEqual({ ok: false, reason: "expired" });
    const late = await createLoginChallenge(db, user.id, "password", T0);
    expect(await completeLoginChallenge(db, late.token, code(secret, T0 + 11 * 60_000), T0 + 11 * 60_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("one user's code or backup code never unlocks another account", async () => {
    const a = await enabledUser();
    const b = await enabledUser();
    expect(await verifySecondFactor(b.db, b.user.id, a.recoveryCodes[1], T0)).toBeNull();
    expect(await verifySecondFactor(b.db, b.user.id, code(a.secret, T0 + 30_000), T0 + 30_000)).toBeNull();
  });
});

describe("turning it off and new backup codes", () => {
  it("needs both the password and a code", async () => {
    const { user, db, secret } = await enabledUser();
    await expect(disableTwoFactor(db, user.id, "wrong password", code(secret, T0 + 30_000), T0 + 30_000)).rejects.toThrow(/Password/);
    await expect(disableTwoFactor(db, user.id, "correct horse battery", "000000", T0 + 30_000)).rejects.toThrow(/didn't match/);
    await disableTwoFactor(db, user.id, "correct horse battery", code(secret, T0 + 60_000), T0 + 60_000);
    expect(await twoFactorStatus(db, user.id)).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
  });

  it("new backup codes replace the old ones", async () => {
    const { user, db, secret, recoveryCodes } = await enabledUser();
    const fresh = await regenerateRecoveryCodes(db, user.id, code(secret, T0 + 30_000), T0 + 30_000);
    expect(await verifySecondFactor(db, user.id, recoveryCodes[0], T0)).toBeNull();
    expect(await verifySecondFactor(db, user.id, fresh[0], T0)).toBe("recovery");
  });
});

describe("email me a code (owner, 2026-11-06)", () => {
  const MIN = 60_000;

  it("emails a 6-digit code bound to this sign-in; it works once and only a hash is stored", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0 + MIN);
    if (!r.ok) throw new Error(`not issued: ${r.reason}`);
    expect(r.code).toMatch(/^\d{6}$/);
    expect(r.email).toBe(user.email);
    expect(r.to).toBe(maskEmail(user.email));
    const rows = await db.select().from(loginChallenges).where(eq(loginChallenges.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].emailCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].emailCodeHash).not.toContain(r.code);
    expect(rows[0].emailSends).toBe(1);
    expect(await completeLoginChallenge(db, token, r.code.slice(0, 3) + " " + r.code.slice(3), T0 + 2 * MIN)).toEqual({
      ok: true,
      userId: user.id,
      method: "email",
    });
    expect(await completeLoginChallenge(db, token, r.code, T0 + 2 * MIN)).toEqual({ ok: false, reason: "expired" });
  });

  it("a new code replaces the old one, codes expire, and at most 3 are sent per sign-in", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const a = await issueLoginEmailCode(db, token, T0);
    const b = await issueLoginEmailCode(db, token, T0 + MIN);
    const c = await issueLoginEmailCode(db, token, T0 + 2 * MIN);
    if (!a.ok || !b.ok || !c.ok) throw new Error("not issued");
    expect(await issueLoginEmailCode(db, token, T0 + 3 * MIN)).toEqual({ ok: false, reason: "too_many" });
    expect(MAX_EMAIL_SENDS).toBe(3);
    if (a.code !== c.code) expect(await completeLoginChallenge(db, token, a.code, T0 + 3 * MIN)).toEqual({ ok: false, reason: "wrong" });
    // c was sent at minute 2, so it is gone after minute 12.
    expect(await completeLoginChallenge(db, token, c.code, T0 + 13 * MIN)).toEqual({ ok: false, reason: "expired" });
  });

  it("wrong email codes use up the same 5 tries", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0);
    if (!r.ok) throw new Error("not issued");
    const wrong = r.code === "000000" ? "111111" : "000000";
    for (let i = 1; i < MAX_CHALLENGE_ATTEMPTS; i++) expect(await completeLoginChallenge(db, token, wrong, T0 + MIN)).toEqual({ ok: false, reason: "wrong" });
    expect(await completeLoginChallenge(db, token, wrong, T0 + MIN)).toEqual({ ok: false, reason: "locked" });
    expect(await completeLoginChallenge(db, token, r.code, T0 + MIN)).toEqual({ ok: false, reason: "expired" });
  });

  it("a code for one sign-in never works on another, and a forged sign-in gets nothing", async () => {
    const { user, db } = await enabledUser();
    const first = await createLoginChallenge(db, user.id, "password", T0);
    const second = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, first.token, T0);
    if (!r.ok) throw new Error("not issued");
    expect(await completeLoginChallenge(db, second.token, r.code, T0 + MIN)).toEqual({ ok: false, reason: "wrong" });
    expect(await issueLoginEmailCode(db, "forged-token", T0)).toEqual({ ok: false, reason: "expired" });
    expect(await issueLoginEmailCode(db, first.token, T0 + 11 * MIN)).toEqual({ ok: false, reason: "expired" });
  });

  it("is never offered after Google or Apple (same inbox), only after the password", async () => {
    const { user, db } = await enabledUser();
    const viaGoogle = await createLoginChallenge(db, user.id, "oauth", T0);
    expect(await issueLoginEmailCode(db, viaGoogle.token, T0)).toEqual({ ok: false, reason: "not_password" });
    const viaPassword = await createLoginChallenge(db, user.id, "password", T0);
    expect((await issueLoginEmailCode(db, viaPassword.token, T0)).ok).toBe(true);
  });

  it("is off after a password reset until a sign-in with the authenticator, so an inbox alone never gets past two-step", async () => {
    const { user, db, secret } = await enabledUser();
    await db
      .update(users)
      .set({ emailCodesBlockedAt: new Date(T0) })
      .where(eq(users.id, user.id));
    const blocked = await createLoginChallenge(db, user.id, "password", T0);
    expect(await issueLoginEmailCode(db, blocked.token, T0)).toEqual({ ok: false, reason: "after_reset" });
    // Waiting doesn't help: still off a month later.
    const monthLater = await createLoginChallenge(db, user.id, "password", T0 + 30 * 24 * 3_600_000);
    expect(await issueLoginEmailCode(db, monthLater.token, T0 + 30 * 24 * 3_600_000)).toEqual({ ok: false, reason: "after_reset" });
    // One sign-in with the authenticator turns email codes back on.
    const strong = await createLoginChallenge(db, user.id, "password", T0 + MIN);
    expect(await completeLoginChallenge(db, strong.token, code(secret, T0 + 2 * MIN), T0 + 2 * MIN)).toMatchObject({ ok: true, method: "totp" });
    const again = await createLoginChallenge(db, user.id, "password", T0 + 3 * MIN);
    expect((await issueLoginEmailCode(db, again.token, T0 + 3 * MIN)).ok).toBe(true);
  });

  // security review, 2026-11-14 (F1, F3): a code sent before a reset, or a sign-in opened before it, is worthless after it
  it("an emailed code sent before emailed codes were blocked is refused once they are", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0);
    if (!r.ok) throw new Error(`not issued: ${r.reason}`);
    await db
      .update(users)
      .set({ emailCodesBlockedAt: new Date(T0 + MIN) })
      .where(eq(users.id, user.id));
    expect(await completeLoginChallenge(db, token, r.code, T0 + 2 * MIN)).toEqual({ ok: false, reason: "wrong" });
  });

  it("a password reset ends every half-done sign-in, so an emailed code sent before it can't be used after it", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0);
    if (!r.ok) throw new Error(`not issued: ${r.reason}`);
    const reset = randomBytes(32).toString("base64url");
    await db.insert(passwordResets).values({ id: createHash("sha256").update(reset).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 60_000) });
    await resetPassword(db, reset, "a fresh long passphrase after reset 41");
    expect(await db.select().from(loginChallenges).where(eq(loginChallenges.userId, user.id))).toEqual([]);
    expect(await completeLoginChallenge(db, token, r.code, T0 + MIN)).toEqual({ ok: false, reason: "expired" });
    // and a new sign-in after the reset can't get an emailed code at all
    const after = await createLoginChallenge(db, user.id, "password", T0 + 2 * MIN);
    expect(await issueLoginEmailCode(db, after.token, T0 + 2 * MIN)).toEqual({ ok: false, reason: "after_reset" });
  });

  it("a password change ends every half-done sign-in too", async () => {
    const { user, db, secret } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    await changePassword(db, user.id, "correct horse battery", "a brand new long passphrase 88");
    expect(await db.select().from(loginChallenges).where(eq(loginChallenges.userId, user.id))).toEqual([]);
    expect(await completeLoginChallenge(db, token, code(secret, T0 + MIN), T0 + MIN)).toEqual({ ok: false, reason: "expired" });
  });

  it("one code can never start two sessions, even when sent twice at the same moment", async () => {
    const { user, db } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0);
    if (!r.ok) throw new Error("not issued");
    const results = await Promise.all([completeLoginChallenge(db, token, r.code, T0 + MIN), completeLoginChallenge(db, token, r.code, T0 + MIN)]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
  });

  it("sending a code extends the sign-in to the code's 10 minutes", async () => {
    const { user, db } = await enabledUser();
    const { token, expiresAt } = await createLoginChallenge(db, user.id, "password", T0);
    const r = await issueLoginEmailCode(db, token, T0 + 9 * MIN);
    if (!r.ok) throw new Error("not issued");
    expect(r.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
    expect(await completeLoginChallenge(db, token, r.code, T0 + 15 * MIN)).toEqual({ ok: true, userId: user.id, method: "email" });
  });

  it("shows the address without giving it away", () => {
    expect(maskEmail("ali@gmail.com")).toBe("a•••@gmail.com");
    expect(maskEmail("nope")).toBe("your email");
  });
});

describe("lost your app? start over with an email code (owner, 2026-11-06)", () => {
  const PW = "correct horse battery"; // makeUser's password

  it("needs the password, then the emailed code resets two-step so a new app can be set up", async () => {
    const { user, db, recoveryCodes } = await enabledUser();
    await expect(beginTwoFactorRestart(db, user.id, "wrong password", T0)).rejects.toThrow(/Password is incorrect/);
    const mine = await createSession(db, user.id);
    const lostPhone = await createSession(db, user.id);
    const keep = createHash("sha256").update(mine.token).digest("hex");
    const r = await beginTwoFactorRestart(db, user.id, PW, T0);
    expect(r.code).toMatch(/^\d{6}$/);
    expect(r.email).toBe(user.email);
    // a wrong code changes nothing
    const wrong = r.code === "000000" ? "111111" : "000000";
    await expect(finishTwoFactorRestart(db, user.id, r.token, wrong, null, T0 + 60_000)).rejects.toThrow(/didn't match/);
    expect((await twoFactorStatus(db, user.id)).enabled).toBe(true);
    await finishTwoFactorRestart(db, user.id, r.token, r.code, keep, T0 + 60_000);
    const status = await twoFactorStatus(db, user.id);
    expect(status).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
    // the session doing the reset stays; every other device is signed out
    expect(await validateSession(db, mine.token)).not.toBeNull();
    expect(await validateSession(db, lostPhone.token)).toBeNull();
    // the old backup codes are gone, and a brand new setup works
    expect(await verifySecondFactor(db, user.id, recoveryCodes[1], T0)).toBeNull();
    const { secret } = await beginTotpSetup(db, user.id);
    const again = await confirmTotpSetup(db, user.id, code(secret, T0 + 120_000), T0 + 120_000);
    expect(again.recoveryCodes).toHaveLength(10);
    // the code worked once
    await expect(finishTwoFactorRestart(db, user.id, r.token, r.code, keep, T0 + 60_000)).rejects.toThrow(/expired/);
  });

  it("is refused after a password reset until a strong sign-in, and never resets another account", async () => {
    const { user, db } = await enabledUser();
    await db
      .update(users)
      .set({ emailCodesBlockedAt: new Date(T0) })
      .where(eq(users.id, user.id));
    await expect(beginTwoFactorRestart(db, user.id, PW, T0)).rejects.toThrow(/after a password reset/);
    await db.update(users).set({ emailCodesBlockedAt: null }).where(eq(users.id, user.id));
    const other = await enabledUser();
    const r = await beginTwoFactorRestart(db, user.id, PW, T0);
    await expect(finishTwoFactorRestart(db, other.user.id, r.token, r.code, null, T0 + 60_000)).rejects.toThrow(/isn't for this account/);
    expect((await twoFactorStatus(db, other.user.id)).enabled).toBe(true);
  });
  it("a first password on a two-step account turns email codes off, so session + inbox can't reset two-step", async () => {
    const { user, db } = await enabledUser();
    await db.update(users).set({ passwordHash: "!google" }).where(eq(users.id, user.id));
    await changePassword(db, user.id, "", "a brand new long passphrase 77");
    const [u] = await db.select({ blocked: users.emailCodesBlockedAt }).from(users).where(eq(users.id, user.id));
    expect(u.blocked).not.toBeNull();
    await expect(beginTwoFactorRestart(db, user.id, "a brand new long passphrase 77", T0)).rejects.toThrow(/after a password reset/);
  });
});
