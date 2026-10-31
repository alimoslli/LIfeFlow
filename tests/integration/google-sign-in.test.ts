import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { completeAppleSignIn, unlinkApple } from "@/server/auth/apple";
import { takeChallenge } from "@/server/auth/challenges";
import {
  completeGoogleSignIn,
  exchangeGoogleSignInCode,
  googleSignInConfig,
  parseGoogleState,
  startGoogleSignIn,
  unlinkGoogle,
  verifyGoogleIdToken,
} from "@/server/auth/google-signin";
import { linkPendingOAuth } from "@/server/auth/oauth";
import { closeDb, getDb } from "@/server/db/client";
import { oauthIdentities, users } from "@/server/db/schema";
import { makeUser } from "../helpers";

afterAll(closeDb);

const CFG = { clientId: "123.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "https://app.example/api/auth/google/callback" };
const signin = { mode: "signin" as const, tz: "UTC", userId: null };

async function fakeGoogle() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "g", alg: "RS256" }] });
  const idToken = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "g" })
      .setIssuer(opts.iss ?? "https://accounts.google.com")
      .setAudience(opts.aud ?? CFG.clientId)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
  return { keys, idToken };
}

describe("Sign in with Google", () => {
  it("is available only with the Google client and the app address set", () => {
    expect(googleSignInConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toBeNull();
    expect(googleSignInConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", APP_URL: "https://app.example/" })).toEqual({
      clientId: "a",
      clientSecret: "b",
      redirectUri: "https://app.example/api/auth/google/callback",
    });
  });

  it("starts with a single-use state, nonce and PKCE, asking only for the basic profile", async () => {
    const db = getDb();
    const r = await startGoogleSignIn(db, CFG, { mode: "signin", tz: "America/Chicago", next: "/plan" });
    const u = new URL(r.url);
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(r.token);
    const ch = await takeChallenge(db, "google", r.token);
    const state = parseGoogleState(ch!.challenge);
    expect(state).toMatchObject({ mode: "signin", tz: "America/Chicago", next: "/plan", nonce: u.searchParams.get("nonce") });
    expect(await takeChallenge(db, "google", r.token)).toBeNull();
  });

  it("verifies Google's token: signature, issuer, audience and nonce", async () => {
    const g = await fakeGoogle();
    const good = await g.idToken({ sub: "g-1", email: "Sam@Gmail.com", email_verified: true, name: "Sam Lee", nonce: "n1" });
    expect(await verifyGoogleIdToken(good, CFG, "n1", g.keys)).toEqual({
      sub: "g-1",
      email: "sam@gmail.com",
      emailVerified: true,
      isPrivateEmail: false,
      name: "Sam Lee",
    });
    await expect(verifyGoogleIdToken(good, CFG, "other", g.keys)).rejects.toThrow(/didn't match/);
    await expect(verifyGoogleIdToken(await g.idToken({ sub: "g-1", nonce: "n1" }, { aud: "someone-else" }), CFG, "n1", g.keys)).rejects.toThrow(/verified/);
    await expect(verifyGoogleIdToken(await g.idToken({ sub: "g-1", nonce: "n1" }, { iss: "https://evil.example" }), CFG, "n1", g.keys)).rejects.toThrow(
      /verified/,
    );
    const other = await fakeGoogle();
    await expect(verifyGoogleIdToken(good, CFG, "n1", other.keys)).rejects.toThrow(/verified/);
  });

  it("sends the PKCE verifier and reports a refused code plainly", async () => {
    const seen: URLSearchParams[] = [];
    const ok = (async (_u: string, init: RequestInit) => {
      seen.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ id_token: "tok" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await exchangeGoogleSignInCode(CFG, "code", "verifier", ok)).toBe("tok");
    expect(seen[0].get("code_verifier")).toBe("verifier");
    const bad = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeGoogleSignInCode(CFG, "code", "v", bad)).rejects.toThrow(/didn't accept/);
  });

  it("creates an account, signs back in, and never links to an existing account on email alone", async () => {
    const db = getDb();
    const email = `${crypto.randomUUID().slice(0, 8)}@gmail.com`;
    const claims = { sub: `g-${crypto.randomUUID()}`, email, emailVerified: true, isPrivateEmail: false };
    const created = await completeGoogleSignIn(db, claims, signin, "Ana Ruiz");
    expect(created.kind).toBe("created");
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toMatchObject({ name: "Ana Ruiz", passwordHash: "!google" });
    expect(await completeGoogleSignIn(db, claims, signin, null)).toEqual({ kind: "signed-in", userId: u.id, totpEnabled: false });

    // Existing password account with the same email: link only after a real sign-in.
    const { user } = await makeUser("Existing");
    const g = { sub: `g-${crypto.randomUUID()}`, email: user.email, emailVerified: true, isPrivateEmail: false };
    const r = await completeGoogleSignIn(db, g, signin, null);
    if (r.kind !== "link-required") throw new Error("expected link-required");
    const { user: stranger } = await makeUser();
    expect(await linkPendingOAuth(db, stranger.id, r.pendingToken)).toBe(false);
    const r2 = await completeGoogleSignIn(db, g, signin, null);
    if (r2.kind !== "link-required") throw new Error("expected link-required");
    expect(await linkPendingOAuth(db, user.id, r2.pendingToken)).toBe(true);
    const [ident] = await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, user.id));
    expect(ident).toMatchObject({ provider: "google", subject: g.sub });
    expect(await completeGoogleSignIn(db, g, signin, null)).toMatchObject({ kind: "signed-in", userId: user.id });
  });

  it("unlinks only when there's still a way to sign in", async () => {
    const db = getDb();
    const email = `${crypto.randomUUID().slice(0, 8)}@gmail.com`;
    const created = await completeGoogleSignIn(db, { sub: `g-${crypto.randomUUID()}`, email, emailVerified: true, isPrivateEmail: false }, signin, null);
    if (created.kind !== "created") throw new Error("expected created");
    await expect(unlinkGoogle(db, created.userId)).rejects.toThrow(/Set a password first/);
    // With Apple also linked, either one can go, but not both.
    const apple = { sub: `001.${crypto.randomUUID()}`, email: null, emailVerified: false, isPrivateEmail: false };
    await completeAppleSignIn(db, apple, { mode: "link", tz: "UTC", userId: created.userId }, null);
    await unlinkGoogle(db, created.userId);
    await expect(unlinkApple(db, created.userId)).rejects.toThrow(/Set a password first/);
  });
});
