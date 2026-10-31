import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { isValidTimeZone } from "../services/accounts";
import type { Database } from "../db/client";
import { googleConfig } from "../integrations/google";
import { saveChallenge } from "./challenges";
import { completeOAuthSignIn, identityFor, unlinkIdentity, type OAuthClaims } from "./oauth";

/**
 * Sign in with Google (OpenID Connect, ADR 0009). Same shape as Apple:
 * 1. /api/auth/google/start saves a single-use state with a nonce and PKCE verifier, then redirects to Google.
 * 2. Google redirects back to /api/auth/google/callback with a code. We swap it (with the verifier and
 *    client secret) for an id_token and verify its signature against Google's keys, plus issuer,
 *    audience, expiry and our nonce.
 * 3. Account rules are shared with Apple (oauth.ts): never linked to an existing account on email alone.
 * Only the basic profile (openid email profile) is requested; Gmail and Calendar stay a separate opt-in.
 * Uses the same Google OAuth client as the Gmail connection (GOOGLE_CLIENT_ID / SECRET) and APP_URL.
 */

const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export class GoogleSignInError extends Error {}
export type GoogleSignInConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleSignInConfig(env: Record<string, string | undefined> = process.env): GoogleSignInConfig | null {
  const g = googleConfig(env);
  if (!g?.appUrl) return null;
  return { clientId: g.clientId, clientSecret: g.clientSecret, redirectUri: `${g.appUrl}/api/auth/google/callback` };
}

export const GOOGLE_STATE_COOKIE = "lf_google_state";
const stateSchema = z.object({ nonce: z.string(), verifier: z.string(), mode: z.enum(["signin", "link"]), tz: z.string().max(64), next: z.string().max(200) });
export const parseGoogleState = (raw: string) => stateSchema.parse(JSON.parse(raw));

export async function startGoogleSignIn(
  db: Database,
  cfg: GoogleSignInConfig,
  opts: { mode: "signin" | "link"; tz?: string; next?: string; userId?: string | null },
) {
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const tz = opts.tz && isValidTimeZone(opts.tz) ? opts.tz : "UTC";
  const { token, expiresAt } = await saveChallenge(
    db,
    "google",
    JSON.stringify({ nonce, verifier, mode: opts.mode, tz, next: opts.next ?? "/" }),
    opts.userId ?? null,
    10 * 60_000,
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: token,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), token, expiresAt };
}

export async function exchangeGoogleSignInCode(cfg: GoogleSignInConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => ({}))) as { id_token?: string } | undefined;
  if (!res?.ok || !json?.id_token) throw new GoogleSignInError("Google didn't accept the sign-in. Please try again.");
  return json.id_token;
}

/** Verifies Google's id_token: signature (Google's keys), issuer, audience, expiry and our nonce. */
export async function verifyGoogleIdToken(
  idToken: string,
  cfg: Pick<GoogleSignInConfig, "clientId">,
  nonce: string,
  keys: JWTVerifyGetKey = GOOGLE_JWKS,
): Promise<OAuthClaims & { name: string | null }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: cfg.clientId, algorithms: ["RS256"] }));
  } catch {
    throw new GoogleSignInError("Google's sign-in response couldn't be verified. Please try again.");
  }
  if (payload.nonce !== nonce) throw new GoogleSignInError("Google's sign-in response didn't match this request. Please try again.");
  if (typeof payload.sub !== "string" || !payload.sub) throw new GoogleSignInError("Google didn't send an account id.");
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 80) : null;
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    isPrivateEmail: false,
    name,
  };
}

export const completeGoogleSignIn = (
  db: Database,
  claims: OAuthClaims,
  state: { mode: "signin" | "link"; tz: string; userId: string | null },
  name: string | null,
) => completeOAuthSignIn(db, "google", claims, state, name, GoogleSignInError);
export const googleIdentityFor = (db: Database, userId: string) => identityFor(db, userId, "google");
export const unlinkGoogle = (db: Database, userId: string) => unlinkIdentity(db, userId, "google", GoogleSignInError);
