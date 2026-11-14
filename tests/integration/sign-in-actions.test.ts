import { Secret, TOTP } from "otpauth";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * The real sign-in actions, login() and verifyLogin(), with Next's request APIs stood in for (security review,
 * 2026-11-14, F2): the remembered-phone decision is tested where it is made, not only in its helpers.
 */
const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void h.jar.set(name, value),
    delete: (name: string) => void h.jar.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
}));
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

const { login, verifyLogin } = await import("@/app/(auth)/actions");
const { DEVICE_COOKIE, rememberDevice } = await import("@/server/auth/remembered-devices");
const { adminFor } = await import("@/server/auth/admin");
const { CHALLENGE_COOKIE, beginTotpSetup, confirmTotpSetup, issueLoginEmailCode } = await import("@/server/auth/two-factor");
const { closeDb, getDb } = await import("@/server/db/client");
const { makeUser } = await import("../helpers");

afterAll(closeDb);
const db = getDb();
const PW = "correct horse battery";
const savedAdmins = process.env.ADMIN_EMAILS;
afterEach(() => {
  h.jar.clear();
  process.env.ADMIN_EMAILS = savedAdmins;
});

async function twoStepUser(name: string) {
  const { user } = await makeUser(name);
  const { secret } = await beginTotpSetup(db, user.id);
  const now = Date.now();
  await confirmTotpSetup(
    db,
    user.id,
    new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({ timestamp: now }),
    now,
  );
  return user;
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
/** Runs an action that ends in a redirect and returns where it went. */
async function goesTo(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    if (e instanceof Redirected) return e.to;
    throw e;
  }
  return null;
}
/** The password step, then an emailed code for that sign-in, then the verify step with the box ticked. */
async function signInWithEmailCode(email: string) {
  expect(await goesTo(() => login(null, form({ email, password: PW })))).toBe("/login/verify");
  const sent = await issueLoginEmailCode(db, h.jar.get(CHALLENGE_COOKIE) ?? "");
  if (!sent.ok) throw new Error(`no code: ${sent.reason}`);
  return goesTo(() => verifyLogin(null, form({ code: sent.code, remember: "on" })));
}

describe("sign-in actions: remember this phone after an emailed code (owner, 2026-11-14)", () => {
  it("a normal account: the emailed code remembers the phone, and the next sign-in on it skips the code", async () => {
    const user = await twoStepUser("Emma Emailcode");
    expect(await signInWithEmailCode(user.email)).toBe("/");
    expect(h.jar.get(DEVICE_COOKIE)).toBeTruthy();
    // signed out on this phone: the session cookie goes, the remembered phone stays
    const device = h.jar.get(DEVICE_COOKIE)!;
    h.jar.clear();
    h.jar.set(DEVICE_COOKIE, device);
    expect(await goesTo(() => login(null, form({ email: user.email, password: PW })))).toBe("/");
  });

  it("the admin account: an emailed code never remembers the phone, and a remembered phone never skips the code", async () => {
    const user = await twoStepUser("Ada Admin");
    process.env.ADMIN_EMAILS = user.email;
    expect(await adminFor(db, user.id)).not.toBeNull(); // really the admin: listed, two-step on
    expect(await signInWithEmailCode(user.email)).toBe("/");
    expect(h.jar.get(DEVICE_COOKIE)).toBeUndefined();
    // even with a valid remembered-phone cookie for this account, the password step still asks for the code
    h.jar.clear();
    h.jar.set(DEVICE_COOKIE, (await rememberDevice(db, user.id, "vitest")).value);
    expect(await goesTo(() => login(null, form({ email: user.email, password: PW })))).toBe("/login/verify");
  });
});
