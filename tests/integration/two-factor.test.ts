import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import {
  beginTotpSetup,
  checkTotp,
  completeLoginChallenge,
  confirmTotpSetup,
  createLoginChallenge,
  disableTwoFactor,
  MAX_CHALLENGE_ATTEMPTS,
  regenerateRecoveryCodes,
  twoFactorStatus,
  verifySecondFactor,
} from "@/server/auth/two-factor";
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
    const { token } = await createLoginChallenge(db, user.id, T0);
    for (let i = 1; i < MAX_CHALLENGE_ATTEMPTS; i++)
      expect(await completeLoginChallenge(db, token, "000000", T0 + 60_000)).toEqual({ ok: false, reason: "wrong" });
    expect(await completeLoginChallenge(db, token, "000000", T0 + 60_000)).toEqual({ ok: false, reason: "locked" });
    // Even the right code no longer works on a locked challenge.
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("a correct code completes the challenge once; expired or forged tokens fail", async () => {
    const { user, db, secret } = await enabledUser();
    const { token } = await createLoginChallenge(db, user.id, T0);
    expect(await completeLoginChallenge(db, "forged-token", code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: false, reason: "expired" });
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 60_000), T0 + 60_000)).toEqual({ ok: true, userId: user.id, method: "totp" });
    expect(await completeLoginChallenge(db, token, code(secret, T0 + 90_000), T0 + 90_000)).toEqual({ ok: false, reason: "expired" });
    const late = await createLoginChallenge(db, user.id, T0);
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
