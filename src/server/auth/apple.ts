import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { isValidTimeZone } from "../services/accounts";
import type { Database } from "../db/client";
import { oauthIdentities, users } from "../db/schema";
import { withUser } from "../db/with-user";
import { audit } from "../services/audit";
import { seedDefaultCategories } from "../services/finance/categories";
import { saveChallenge, takeChallenge } from "./challenges";

/**
 * Sign in with Apple (web flow, response_mode=form_post).
 *
 * 1. /api/auth/apple/start saves a single-use state + nonce and redirects to Apple.
 * 2. Apple POSTs back to /api/auth/apple/callback with a code (and, the first
 *    time only, the person's name). We swap the code for an id_token using a
 *    client secret signed with the .p8 key, and verify the id_token's signature
 *    against Apple's published keys, its issuer, audience, expiry and our nonce.
 * 3. The Apple user id ("sub") is what identifies the person. An email that
 *    matches an existing account is never linked automatically: the person
 *    signs in to that account once to confirm, then Apple is linked.
 *
 * Secrets (team id, key id, private key) come from env vars only.
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export class AppleSignInError extends Error {}

export type AppleConfig = { clientId: string; teamId: string; keyId: string; privateKey: string; redirectUri: string };

export function appleConfig(env: Record<string, string | undefined> = process.env): AppleConfig | null {
  const clientId = env.APPLE_CLIENT_ID?.trim();
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  // Vercel stores multi-line values fine; "\n" escapes are accepted too.
  const privateKey = env.APPLE_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  const appUrl = env.APP_URL?.trim().replace(/\/$/, "");
  if (!clientId || !teamId || !keyId || !privateKey || !appUrl) return null;
  return { clientId, teamId, keyId, privateKey, redirectUri: `${appUrl}/api/auth/apple/callback` };
}

/** The client secret Apple wants: a short-lived ES256 JWT signed with the .p8 key. */
export async function appleClientSecret(cfg: AppleConfig, now = new Date()) {
  const key = await importPKCS8(cfg.privateKey, "ES256");
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .setAudience(APPLE_ISSUER)
    .setSubject(cfg.clientId)
    .sign(key);
}

export const APPLE_STATE_COOKIE = "lf_apple_state";
export const APPLE_LINK_COOKIE = "lf_apple_link";

const stateSchema = z.object({ nonce: z.string(), mode: z.enum(["signin", "link"]), tz: z.string().max(64), next: z.string().max(200) });

/** Step 1: where to send the browser, plus the token for the state cookie. */
export async function startAppleSignIn(db: Database, cfg: AppleConfig, opts: { mode: "signin" | "link"; tz?: string; next?: string; userId?: string | null }) {
  const nonce = randomBytes(16).toString("base64url");
  const tz = opts.tz && isValidTimeZone(opts.tz) ? opts.tz : "UTC";
  const { token, expiresAt } = await saveChallenge(
    db,
    "apple",
    JSON.stringify({ nonce, mode: opts.mode, tz, next: opts.next ?? "/" }),
    opts.userId ?? null,
    10 * 60_000,
  );
  const url = new URL(`${APPLE_ISSUER}/auth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    response_mode: "form_post",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: "name email",
    state: token,
    nonce,
  }).toString();
  return { url: url.toString(), token, expiresAt };
}

export type AppleClaims = { sub: string; email: string | null; emailVerified: boolean; isPrivateEmail: boolean };

/** Verifies Apple's id_token: signature (Apple's keys), issuer, audience, expiry and our nonce. */
export async function verifyAppleIdToken(
  idToken: string,
  cfg: Pick<AppleConfig, "clientId">,
  nonce: string,
  keys: JWTVerifyGetKey = APPLE_JWKS,
): Promise<AppleClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, { issuer: APPLE_ISSUER, audience: cfg.clientId, algorithms: ["RS256", "ES256"] }));
  } catch {
    throw new AppleSignInError("Apple's sign-in response couldn't be verified. Please try again.");
  }
  if (payload.nonce !== nonce) throw new AppleSignInError("Apple's sign-in response didn't match this request. Please try again.");
  if (typeof payload.sub !== "string" || !payload.sub) throw new AppleSignInError("Apple didn't send an account id.");
  const bool = (v: unknown) => v === true || v === "true";
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: bool(payload.email_verified),
    isPrivateEmail: bool(payload.is_private_email),
  };
}

/** Swaps the authorization code for Apple's id_token. */
export async function exchangeAppleCode(cfg: AppleConfig, code: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: await appleClientSecret(cfg),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !json.id_token) throw new AppleSignInError("Apple didn't accept the sign-in. Please try again.");
  return json.id_token;
}

/** Apple sends the name once, as untrusted form data: {"name":{"firstName","lastName"}}. */
export function nameFromApple(raw: string | null | undefined) {
  try {
    const n = (JSON.parse(raw ?? "null") as { name?: { firstName?: unknown; lastName?: unknown } } | null)?.name;
    const parts = [n?.firstName, n?.lastName].filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 40));
    return parts.length ? parts.join(" ") : null;
  } catch {
    return null;
  }
}

export type AppleOutcome =
  | { kind: "signed-in"; userId: string; totpEnabled: boolean }
  | { kind: "created"; userId: string }
  | { kind: "linked"; userId: string }
  | { kind: "link-required"; email: string; pendingToken: string; expiresAt: Date };

/**
 * Step 2, after the id_token is verified. `state` is what step 1 saved.
 * - Known Apple id → sign in.
 * - "link" mode (from Settings, signed in) → link to that account.
 * - Email matches an existing account → ask them to sign in to it first.
 * - Otherwise → create the account (with the Hide My Email address if they chose it).
 */
export async function completeAppleSignIn(
  db: Database,
  claims: AppleClaims,
  state: { mode: "signin" | "link"; tz: string; userId: string | null },
  name: string | null,
): Promise<AppleOutcome> {
  const [known] = await db
    .select({ userId: oauthIdentities.userId, totp: users.totpEnabledAt })
    .from(oauthIdentities)
    .innerJoin(users, eq(users.id, oauthIdentities.userId))
    .where(and(eq(oauthIdentities.provider, "apple"), eq(oauthIdentities.subject, claims.sub)));

  if (state.mode === "link") {
    if (!state.userId) throw new AppleSignInError("Sign in first, then link Apple from Settings.");
    if (known && known.userId !== state.userId) throw new AppleSignInError("This Apple ID is already linked to another LifeFlow account.");
    if (!known) await linkIdentity(db, state.userId, claims);
    return { kind: "linked", userId: state.userId };
  }

  if (known) {
    await db
      .update(oauthIdentities)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(oauthIdentities.provider, "apple"), eq(oauthIdentities.subject, claims.sub)));
    return { kind: "signed-in", userId: known.userId, totpEnabled: !!known.totp };
  }

  if (!claims.email || !claims.emailVerified) throw new AppleSignInError("Apple didn't share a verified email address, so an account can't be created.");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, claims.email));
  if (existing) {
    // Don't link on email alone: they confirm by signing in to the existing account once.
    const { token, expiresAt } = await saveChallenge(db, "apple", JSON.stringify({ pendingLink: claims }), existing.id, 15 * 60_000);
    return { kind: "link-required", email: claims.email, pendingToken: token, expiresAt };
  }

  const [user] = await db
    .insert(users)
    .values({
      name: name ?? claims.email.split("@")[0].slice(0, 80),
      email: claims.email,
      // No password yet ("Forgot password" or Settings can set one). Never matches a password check.
      passwordHash: "!apple",
      timezone: state.tz,
      preferences: { onboarding: "pending" },
    })
    .returning({ id: users.id });
  await withUser(
    user.id,
    async (s) => {
      await seedDefaultCategories(s);
      await audit(s, "user", "account.created", undefined, { method: "apple", privateEmail: claims.isPrivateEmail });
    },
    db,
  );
  await linkIdentity(db, user.id, claims);
  return { kind: "created", userId: user.id };
}

async function linkIdentity(db: Database, userId: string, claims: AppleClaims) {
  await db
    .insert(oauthIdentities)
    .values({ userId, provider: "apple", subject: claims.sub, email: claims.email, isPrivateEmail: claims.isPrivateEmail, lastUsedAt: new Date() });
  await withUser(userId, (s) => audit(s, "user", "auth.apple_linked", undefined, { privateEmail: claims.isPrivateEmail }), db);
}

/**
 * After someone signs in to an existing account (password, 2FA or passkey):
 * if they came from "Sign in with Apple" for that same account, link it now.
 */
export async function consumePendingAppleLink(db: Database, userId: string) {
  const jar = await cookies();
  const token = jar.get(APPLE_LINK_COOKIE)?.value;
  if (!token) return false;
  jar.delete(APPLE_LINK_COOKIE);
  return linkPendingApple(db, userId, token);
}

/** The cookie-free part of consumePendingAppleLink. Only links to the account the Apple email matched. */
export async function linkPendingApple(db: Database, userId: string, token: string) {
  const ch = await takeChallenge(db, "apple", token);
  if (!ch || ch.userId !== userId) return false;
  const pending = (JSON.parse(ch.challenge) as { pendingLink?: AppleClaims }).pendingLink;
  if (!pending) return false;
  const [taken] = await db
    .select({ id: oauthIdentities.id })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.provider, "apple"), eq(oauthIdentities.subject, pending.sub)));
  if (taken) return false;
  await linkIdentity(db, userId, pending);
  return true;
}

export async function parseAppleState(raw: string) {
  return stateSchema.parse(JSON.parse(raw));
}

export async function appleIdentityFor(db: Database, userId: string) {
  const [row] = await db
    .select({ email: oauthIdentities.email, isPrivateEmail: oauthIdentities.isPrivateEmail, createdAt: oauthIdentities.createdAt })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.userId, userId), eq(oauthIdentities.provider, "apple")));
  return row ?? null;
}

export async function unlinkApple(db: Database, userId: string) {
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u?.hash.startsWith("scrypt$")) throw new AppleSignInError("Set a password first, so you can still sign in after unlinking Apple.");
  await db.delete(oauthIdentities).where(and(eq(oauthIdentities.userId, userId), eq(oauthIdentities.provider, "apple")));
}
