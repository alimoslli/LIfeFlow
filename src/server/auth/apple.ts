import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { decryptSecret } from "../crypto";
import { isValidTimeZone } from "../services/accounts";
import type { Database } from "../db/client";
import { recordError } from "../services/error-reports";
import { saveChallenge } from "./challenges";
import {
  completeOAuthSignIn,
  consumePendingOAuthLink,
  identityFor,
  linkPendingOAuth,
  OAUTH_LINK_COOKIE,
  unlinkIdentity,
  type OAuthClaims,
  type OAuthOutcome,
} from "./oauth";

/**
 * Sign in with Apple (web flow, response_mode=form_post).
 *
 * 1. /api/auth/apple/start saves a single-use state + nonce and redirects to Apple.
 * 2. Apple POSTs back to /api/auth/apple/callback with a code (and, the first
 *    time only, the person's name). We swap the code for an id_token using a
 *    client secret signed with the .p8 key, and verify the id_token's signature
 *    against Apple's published keys, its issuer, audience, expiry and our nonce.
 * 3. The Apple user id ("sub") identifies the person; the account rules (no
 *    linking on email alone) are shared with Google in oauth.ts.
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
export const APPLE_LINK_COOKIE = OAUTH_LINK_COOKIE;

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

export type AppleClaims = OAuthClaims;

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

/** Swaps the authorization code for Apple's id_token and refresh token (kept only so the account can be revoked at Apple later). */
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
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; refresh_token?: string; error?: string };
  if (!res.ok || !json.id_token) throw new AppleSignInError("Apple didn't accept the sign-in. Please try again.");
  return { idToken: json.id_token, refreshToken: typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : null };
}

/**
 * Tells Apple to revoke a stored (encrypted) refresh token: required when an account is deleted (App Store) and sensible on unlink.
 * Throws on any failure; callers treat it as best effort and never put the token in a message.
 */
export async function revokeAppleToken(cfg: AppleConfig, encryptedRefreshToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${APPLE_ISSUER}/auth/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: await appleClientSecret(cfg),
      token: decryptSecret(encryptedRefreshToken),
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new AppleSignInError("Apple didn't confirm the revoke.");
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

export type AppleOutcome = OAuthOutcome;

/** Step 2, after the id_token is verified (rules in oauth.ts). */
export const completeAppleSignIn = (
  db: Database,
  claims: AppleClaims,
  state: { mode: "signin" | "link"; tz: string; userId: string | null },
  name: string | null,
  refreshToken: string | null = null,
) => completeOAuthSignIn(db, "apple", claims, state, name, AppleSignInError, refreshToken);

/** After someone signs in to an existing account: link a pending Apple or Google sign-in for it. */
export const consumePendingAppleLink = consumePendingOAuthLink;
export const linkPendingApple = linkPendingOAuth;

export async function parseAppleState(raw: string) {
  return stateSchema.parse(JSON.parse(raw));
}

export const appleIdentityFor = (db: Database, userId: string) => identityFor(db, userId, "apple");
export async function unlinkApple(db: Database, userId: string, deps: { fetch?: typeof fetch; config?: AppleConfig | null } = {}) {
  // Rules first (a password or another provider must remain), then revoke at Apple (best effort), then clear the token with the row.
  return unlinkIdentity(db, userId, "apple", AppleSignInError, async (stored) => {
    const cfg = deps.config === undefined ? appleConfig() : deps.config;
    if (!stored) return;
    try {
      if (!cfg) throw new Error("not configured");
      await revokeAppleToken(cfg, stored, deps.fetch);
    } catch {
      // Best effort: the link is removed either way. Fixed text only, never the token.
      try {
        await recordError(db, { source: "server", route: "auth.unlink", message: "Unlink: Apple revoke failed" });
      } catch {
        // Recording must not stop the unlink.
      }
    }
  });
}
