import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT, importSPKI, exportSPKI } from "jose";
import {
  appleClientSecret,
  completeAppleSignIn,
  exchangeAppleCode,
  linkPendingApple,
  nameFromApple,
  startAppleSignIn,
  verifyAppleIdToken,
  type AppleConfig,
} from "@/server/auth/apple";
import { saveChallenge, takeChallenge } from "@/server/auth/challenges";
import { isMoneyLocked, moneyLockSettings } from "@/server/auth/money-lock";
import { finishPasskeyAuthentication, passkeyNameFrom, relyingParty, startPasskeyAuthentication, startPasskeyRegistration } from "@/server/auth/passkeys";
import { requestPasswordReset, resetPassword } from "@/server/auth/password-reset";
import { createSession, validateSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { authChallenges, oauthIdentities, users } from "@/server/db/schema";
import { authenticate, deleteAccount } from "@/server/services/accounts";
import { makeToolContext } from "@/server/jarvis/agent";
import { executeToolCall } from "@/server/jarvis/executor";
import { makeUser } from "../helpers";

afterAll(closeDb);

const APPLE: AppleConfig = {
  clientId: "app.lifeflow.web",
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: "",
  redirectUri: "http://localhost/api/auth/apple/callback",
};

/** A stand-in for Apple: our own signing key and JWKS. */
async function fakeApple() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "apple-test", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const idToken = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: number } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "apple-test" })
      .setIssuer(opts.iss ?? "https://appleid.apple.com")
      .setAudience(opts.aud ?? APPLE.clientId)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600)
      .sign(privateKey);
  return { keys, idToken };
}

describe("single-use challenges", () => {
  it("works once, only for its purpose, and not after it expires", async () => {
    const db = getDb();
    const a = await saveChallenge(db, "passkey-login", "abc", null);
    expect(await takeChallenge(db, "passkey-register", a.token)).toBeNull();
    expect(await takeChallenge(db, "passkey-login", a.token)).toEqual({ challenge: "abc", userId: null });
    expect(await takeChallenge(db, "passkey-login", a.token)).toBeNull();
    const b = await saveChallenge(db, "passkey-login", "old", null, -1000);
    expect(await takeChallenge(db, "passkey-login", b.token)).toBeNull();
    // Only a hash of the token is stored.
    const rows = await db.select().from(authChallenges).where(eq(authChallenges.challenge, "old"));
    expect(rows[0].id).not.toBe(b.token);
  });
});

describe("passkeys", () => {
  it("binds to APP_URL (or the request) and names devices plainly", () => {
    expect(relyingParty("http://localhost:3100/api/x", {})).toEqual({ rpID: "localhost", origin: "http://localhost:3100", rpName: "LifeFlow" });
    expect(relyingParty("https://evil.example/api/x", { APP_URL: "https://www.lifeflow.app", WEBAUTHN_RP_ID: "lifeflow.app" })).toEqual({
      rpID: "lifeflow.app",
      origin: "https://www.lifeflow.app",
      rpName: "LifeFlow",
    });
    expect(passkeyNameFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe("iPhone");
    expect(passkeyNameFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36")).toBe("Mac (Chrome)");
  });

  it("issues fresh challenges and refuses unknown or replayed responses", async () => {
    const { user } = await makeUser();
    const db = getDb();
    const rp = relyingParty("http://localhost:3100/");
    const reg = await startPasskeyRegistration(db, user.id, rp);
    expect(reg.options.rp.id).toBe("localhost");
    expect(reg.options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });

    // Unlocking needs a passkey on the account first.
    await expect(startPasskeyAuthentication(db, rp, "passkey-unlock", user.id)).rejects.toThrow(/Add a passkey/);

    const login = await startPasskeyAuthentication(db, rp, "passkey-login");
    expect(login.options.userVerification).toBe("required");
    const fake = {
      id: "bm9wZQ",
      rawId: "bm9wZQ",
      type: "public-key",
      clientExtensionResults: {},
      response: { clientDataJSON: "", authenticatorData: "", signature: "" },
    } as never;
    await expect(finishPasskeyAuthentication(db, "passkey-login", login.token, fake, rp)).rejects.toThrow(/isn't linked/);
    // The challenge was used up by that attempt.
    await expect(finishPasskeyAuthentication(db, "passkey-login", login.token, fake, rp)).rejects.toThrow(/expired/);
  });
});

describe("money lock", () => {
  it("is off by default, locks after the idle window, and unlocks within it", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(isMoneyLocked(moneyLockSettings(undefined), null, now)).toBe(false);
    const on = moneyLockSettings({ moneyLock: { enabled: true, idleMinutes: 5 } });
    expect(isMoneyLocked(on, null, now)).toBe(true);
    expect(isMoneyLocked(on, new Date(now.getTime() - 4 * 60_000), now)).toBe(false);
    expect(isMoneyLocked(on, new Date(now.getTime() - 6 * 60_000), now)).toBe(true);
  });
});

describe("Sign in with Apple", () => {
  it("signs the client secret with the .p8 key the way Apple expects", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const cfg = { ...APPLE, privateKey: await exportPKCS8(privateKey) };
    const jwt = await appleClientSecret(cfg, new Date());
    const { payload, protectedHeader } = await jwtVerify(jwt, await importSPKI(await exportSPKI(publicKey), "ES256"));
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "KEY1234567" });
    expect(payload).toMatchObject({ iss: "TEAM123456", sub: "app.lifeflow.web", aud: "https://appleid.apple.com" });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);

    let sent: URLSearchParams | null = null;
    const token = await exchangeAppleCode(cfg, "the-code", async (_u, init) => {
      sent = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ id_token: "id.token.here" }), { status: 200 });
    });
    expect(token).toBe("id.token.here");
    expect(sent!.get("code")).toBe("the-code");
    expect(sent!.get("client_id")).toBe("app.lifeflow.web");
    await expect(exchangeAppleCode(cfg, "bad", async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))).rejects.toThrow(
      /didn't accept/,
    );
  });

  it("accepts only Apple-signed tokens for this app with the right nonce", async () => {
    const apple = await fakeApple();
    const good = await apple.idToken({ sub: "001.abc", email: "Kai@privaterelay.appleid.com", email_verified: "true", is_private_email: "true", nonce: "n1" });
    expect(await verifyAppleIdToken(good, APPLE, "n1", apple.keys)).toEqual({
      sub: "001.abc",
      email: "kai@privaterelay.appleid.com",
      emailVerified: true,
      isPrivateEmail: true,
    });
    await expect(verifyAppleIdToken(good, APPLE, "other-nonce", apple.keys)).rejects.toThrow(/didn't match/);
    await expect(verifyAppleIdToken(await apple.idToken({ sub: "x", nonce: "n1" }, { aud: "someone.else" }), APPLE, "n1", apple.keys)).rejects.toThrow(
      /couldn't be verified/,
    );
    await expect(verifyAppleIdToken(await apple.idToken({ sub: "x", nonce: "n1" }, { iss: "https://evil.example" }), APPLE, "n1", apple.keys)).rejects.toThrow(
      /couldn't be verified/,
    );
    await expect(verifyAppleIdToken(await apple.idToken({ sub: "x", nonce: "n1" }, { exp: 1 }), APPLE, "n1", apple.keys)).rejects.toThrow(
      /couldn't be verified/,
    );
    const other = await fakeApple(); // signed by someone else's key
    await expect(verifyAppleIdToken(await other.idToken({ sub: "x", nonce: "n1" }), APPLE, "n1", apple.keys)).rejects.toThrow(/couldn't be verified/);
  });

  it("creates an account with Hide My Email, then signs the same Apple ID back in", async () => {
    const db = getDb();
    const sub = `001.${crypto.randomUUID()}`;
    const email = `${crypto.randomUUID().slice(0, 8)}@privaterelay.appleid.com`;
    const claims = { sub, email, emailVerified: true, isPrivateEmail: true };
    const first = await completeAppleSignIn(
      db,
      claims,
      { mode: "signin", tz: "America/Chicago", userId: null },
      nameFromApple('{"name":{"firstName":"Kai","lastName":"Moss"}}'),
    );
    expect(first.kind).toBe("created");
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toMatchObject({ name: "Kai Moss", timezone: "America/Chicago" });
    expect(u.preferences.onboarding).toBe("pending");
    // No password exists, so no password can match.
    expect(await authenticate(db, email, "!apple")).toBeNull();
    const [ident] = await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, u.id));
    expect(ident).toMatchObject({ provider: "apple", subject: sub, isPrivateEmail: true });

    const again = await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null);
    expect(again).toEqual({ kind: "signed-in", userId: u.id, totpEnabled: false });

    // Accounts without a password can still be deleted (after typing DELETE in the UI).
    await deleteAccount(db, u.id, "");
    expect(await db.select().from(users).where(eq(users.id, u.id))).toHaveLength(0);
  });

  it("never links to an existing account on email alone: the owner signs in first", async () => {
    const db = getDb();
    const { user } = await makeUser("Rae Existing");
    const claims = { sub: `001.${crypto.randomUUID()}`, email: user.email, emailVerified: true, isPrivateEmail: false };
    const r = await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null);
    expect(r.kind).toBe("link-required");
    if (r.kind !== "link-required") return;
    expect(await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, user.id))).toHaveLength(0);

    // Someone else signing in can't claim it.
    const { user: other } = await makeUser();
    expect(await linkPendingApple(db, other.id, r.pendingToken)).toBe(false);

    const r2 = await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null);
    if (r2.kind !== "link-required") throw new Error("expected link-required");
    expect(await linkPendingApple(db, user.id, r2.pendingToken)).toBe(true);
    expect(await completeAppleSignIn(db, claims, { mode: "signin", tz: "UTC", userId: null }, null)).toMatchObject({ kind: "signed-in", userId: user.id });
  });

  it("refuses unverified emails and Apple IDs linked to another account", async () => {
    const db = getDb();
    await expect(
      completeAppleSignIn(
        db,
        { sub: "001.zzz", email: "x@y.com", emailVerified: false, isPrivateEmail: false },
        { mode: "signin", tz: "UTC", userId: null },
        null,
      ),
    ).rejects.toThrow(/verified email/);
    const a = await makeUser();
    const b = await makeUser();
    const claims = { sub: `001.${crypto.randomUUID()}`, email: null, emailVerified: false, isPrivateEmail: false };
    expect((await completeAppleSignIn(db, claims, { mode: "link", tz: "UTC", userId: a.user.id }, null)).kind).toBe("linked");
    await expect(completeAppleSignIn(db, claims, { mode: "link", tz: "UTC", userId: b.user.id }, null)).rejects.toThrow(/another LifeFlow account/);
  });

  it("starts with a state and nonce saved on the server", async () => {
    const r = await startAppleSignIn(getDb(), APPLE, { mode: "signin", tz: "Not/AZone" });
    const url = new URL(r.url);
    expect(url.origin + url.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("state")).toBe(r.token);
    const saved = await takeChallenge(getDb(), "apple", r.token);
    expect(JSON.parse(saved!.challenge)).toMatchObject({ nonce: url.searchParams.get("nonce"), mode: "signin", tz: "UTC" });
  });
});

describe("forgot password", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("emails a one-hour, one-use link and signs out everywhere after the reset", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "LifeFlow <hello@example.com>";
    const db = getDb();
    const { user } = await makeUser("Noa Reset");
    const session = await createSession(db, user.id);
    const sent: { to: string[]; text: string }[] = [];
    const fakeResend = (async (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    expect(await requestPasswordReset(db, "nobody@example.com", "https://app.example", fakeResend)).toBeNull();
    expect(sent).toHaveLength(0);

    expect(await requestPasswordReset(db, user.email.toUpperCase(), "https://app.example", fakeResend)).toBe("email_123");
    expect(sent[0].to).toEqual([user.email]);
    const token = /reset-password#([\w-]+)/.exec(sent[0].text)![1];

    await expect(resetPassword(db, token, "short")).rejects.toThrow();
    await resetPassword(db, token, "a brand new long passphrase 42");
    expect(await authenticate(db, user.email, "a brand new long passphrase 42")).not.toBeNull();
    expect(await authenticate(db, user.email, "correct horse battery")).toBeNull();
    expect(await validateSession(db, session.token)).toBeNull();
    await expect(resetPassword(db, token, "another long passphrase 99")).rejects.toThrow(/expired or was already used/);
  });

  it("says so honestly when email isn't configured", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(requestPasswordReset(getDb(), "a@b.com", "https://app.example")).rejects.toThrow(/isn't available yet/);
  });
});

describe("Jarvis and the money lock", () => {
  it("refuses money tools while Money is locked, and keeps other tools working", async () => {
    const { user } = await makeUser("Lia Locked");
    const session = { id: user.id, email: user.email, name: user.name, timezone: user.timezone, accountKind: "standard" as const, preferences: {} };
    const locked = makeToolContext(session, crypto.randomUUID(), new Date(), "", true);
    const money = await executeToolCall("money_overview", "{}", locked, "c1");
    expect(money).toMatchObject({ kind: "result", result: { ok: false } });
    expect(JSON.stringify(money)).toMatch(/Money is locked/);
    const brief = await executeToolCall("get_daily_briefing", "{}", locked, "c2");
    expect(JSON.stringify(brief)).toMatch(/locked with Face ID/);
    expect(JSON.stringify(brief)).not.toMatch(/balances/);
    const unlocked = await executeToolCall("money_overview", "{}", makeToolContext(session, crypto.randomUUID()), "c3");
    expect(unlocked).toMatchObject({ kind: "result", result: { ok: true } });
  });
});
