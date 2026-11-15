import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { afterAll, describe, expect, it } from "vitest";
import { adminFor } from "@/server/auth/admin";
import { skipsSecondStep } from "@/server/auth/oauth";
import { createHash, randomBytes } from "node:crypto";
import { resetPassword } from "@/server/auth/password-reset";
import { DEVICE_TTL_MS, isRememberedDevice, rememberDevice, shouldRememberDevice } from "@/server/auth/remembered-devices";
import { createSession, sessionSkippedSecondStep } from "@/server/auth/sessions";
import { beginTotpSetup, beginTwoFactorRestart, confirmTotpSetup, disableTwoFactor, finishTwoFactorRestart } from "@/server/auth/two-factor";
import { closeDb, getDb } from "@/server/db/client";
import { passwordResets, rememberedDevices, users } from "@/server/db/schema";
import { changePassword } from "@/server/services/accounts";
import { setSuspended, signOutEverywhere } from "@/server/services/admin";
import { makeUser } from "../helpers";

afterAll(closeDb);
const db = getDb();
const PW = "correct horse battery";
const code = (secret: string, at: number) =>
  new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({ timestamp: at });
const NOW = Date.now();

async function twoStepUser() {
  const { user } = await makeUser("Remember");
  const { secret } = await beginTotpSetup(db, user.id);
  await confirmTotpSetup(db, user.id, code(secret, NOW), NOW);
  return { user, secret };
}
const count = async (userId: string) => (await db.select().from(rememberedDevices).where(eq(rememberedDevices.userId, userId))).length;

describe("remembered devices", () => {
  it("a remembered device is recognised, only for its own user", async () => {
    const a = await twoStepUser();
    const b = await twoStepUser();
    const d = await rememberDevice(db, a.user.id, "Phone");
    expect(await isRememberedDevice(db, a.user.id, d.value)).toBe(true);
    expect(await isRememberedDevice(db, b.user.id, d.value)).toBe(false);
    expect(await isRememberedDevice(db, a.user.id, undefined)).toBe(false);
    expect(await isRememberedDevice(db, a.user.id, "garbage")).toBe(false);
    const [id] = d.value.split(".");
    expect(await isRememberedDevice(db, a.user.id, `${id}.wrongtoken`)).toBe(false);
    // only a hash is stored, never the token
    const [row] = await db.select().from(rememberedDevices).where(eq(rememberedDevices.userId, a.user.id));
    expect(d.value).not.toContain(row.tokenHash);
    expect(row.tokenHash).not.toBe(d.value.split(".")[1]);
  });

  it("expires after 30 days and when revoked", async () => {
    const { user } = await twoStepUser();
    const d = await rememberDevice(db, user.id, null, NOW);
    expect(await isRememberedDevice(db, user.id, d.value, NOW + DEVICE_TTL_MS - 1000)).toBe(true);
    expect(await isRememberedDevice(db, user.id, d.value, NOW + DEVICE_TTL_MS + 1000)).toBe(false);
    await db.delete(rememberedDevices).where(eq(rememberedDevices.userId, user.id));
    expect(await isRememberedDevice(db, user.id, d.value, NOW)).toBe(false);
  });

  it("a password reset revokes every remembered device, one earned with an emailed code included", async () => {
    const { user } = await twoStepUser();
    expect(await shouldRememberDevice(db, user.id, "email", true, {})).toBe(true);
    const d = await rememberDevice(db, user.id);
    const token = randomBytes(32).toString("base64url");
    await db.insert(passwordResets).values({ id: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 60_000) });
    await resetPassword(db, token, "a fresh long passphrase after reset 41");
    expect(await isRememberedDevice(db, user.id, d.value)).toBe(false);
    expect(await count(user.id)).toBe(0);
  });

  it("a password change revokes every remembered device", async () => {
    const { user } = await twoStepUser();
    const d = await rememberDevice(db, user.id);
    await changePassword(db, user.id, PW, "a brand new long passphrase 77");
    expect(await isRememberedDevice(db, user.id, d.value)).toBe(false);
  });

  it("turning two-step off, and starting over, revoke them", async () => {
    const a = await twoStepUser();
    const da = await rememberDevice(db, a.user.id);
    await disableTwoFactor(db, a.user.id, PW, code(a.secret, NOW + 60_000), NOW + 60_000);
    expect(await isRememberedDevice(db, a.user.id, da.value)).toBe(false);

    const b = await twoStepUser();
    const dbb = await rememberDevice(db, b.user.id);
    const r = await beginTwoFactorRestart(db, b.user.id, PW, NOW);
    await finishTwoFactorRestart(db, b.user.id, r.token, r.code, null, NOW + 60_000);
    expect(await isRememberedDevice(db, b.user.id, dbb.value)).toBe(false);
  });

  it("an admin signing someone out everywhere, or suspending them, revokes them", async () => {
    const { user: owner } = await makeUser("Owner");
    await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.id));
    process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, owner.email].filter(Boolean).join(",");
    const admin = (await adminFor(db, owner.id))!;
    const { user } = await twoStepUser();
    await rememberDevice(db, user.id);
    await signOutEverywhere(db, admin, user.id);
    expect(await count(user.id)).toBe(0);
    await rememberDevice(db, user.id);
    await setSuspended(db, admin, user.id, true);
    expect(await count(user.id)).toBe(0);
  });

  it("deleting the account removes them (cascade)", async () => {
    const { user } = await twoStepUser();
    await rememberDevice(db, user.id);
    await db.delete(users).where(eq(users.id, user.id));
    expect(await count(user.id)).toBe(0);
  });
});

describe("sessions that skipped the second step", () => {
  it("are marked, and a normal session is not (so /admin refuses the first)", async () => {
    const { user } = await makeUser("Marked");
    const skipped = await createSession(db, user.id, "ua", { secondStepSkipped: true });
    const normal = await createSession(db, user.id, "ua");
    expect(await sessionSkippedSecondStep(db, skipped.token)).toBe(true);
    expect(await sessionSkippedSecondStep(db, normal.token)).toBe(false);
    expect(await sessionSkippedSecondStep(db, "no-such-session")).toBe(true);
  });

  it("Google with two-step on skips our code; Apple, no two-step and the admin account do not", async () => {
    const { user } = await twoStepUser();
    expect(await skipsSecondStep(db, "google", user.id, true)).toBe(true);
    expect(await skipsSecondStep(db, "apple", user.id, true)).toBe(false);
    expect(await skipsSecondStep(db, "google", user.id, false)).toBe(false);
    process.env.ADMIN_EMAILS = [process.env.ADMIN_EMAILS, user.email].filter(Boolean).join(",");
    expect(await skipsSecondStep(db, "google", user.id, true)).toBe(false);
  });
});

// owner, 2026-11-14 (choice A): an emailed code earns the 30 days for a normal account; the admin account never
describe("remember this phone after an emailed code", () => {
  it("a normal account is remembered after an emailed code, only when the box is ticked", async () => {
    const { user } = await twoStepUser();
    expect(await shouldRememberDevice(db, user.id, "email", true, {})).toBe(true);
    expect(await shouldRememberDevice(db, user.id, "email", false, {})).toBe(false);
  });

  it("the admin account is never remembered on the email path, nor on any other", async () => {
    const { user } = await twoStepUser();
    const env = { ADMIN_EMAILS: user.email };
    expect(await adminFor(db, user.id, env)).not.toBeNull(); // really the admin: two-step on, listed
    for (const method of ["email", "totp", "recovery"] as const) expect(await shouldRememberDevice(db, user.id, method, true, env), method).toBe(false);
  });
});
