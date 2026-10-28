import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { passkeys, users } from "../db/schema";
import { saveChallenge, takeChallenge } from "./challenges";

/**
 * Passkeys (WebAuthn): sign in with Face ID, Touch ID or the phone's screen
 * lock. Only public keys are stored. Every ceremony uses a fresh server
 * challenge that works once, and responses are checked against our own origin
 * and RP ID, so a passkey can't be used from another site.
 */

export class PasskeyError extends Error {}

export type RelyingParty = { rpID: string; origin: string; rpName: string };

/**
 * Where passkeys are bound. APP_URL (the public site) wins; WEBAUTHN_RP_ID can
 * widen it to a parent domain (e.g. lifeflow.app for www.lifeflow.app).
 * Without APP_URL (local development, tests) the request's own origin is used.
 */
export function relyingParty(requestUrl: string, env: Record<string, string | undefined> = process.env): RelyingParty {
  const configured = env.APP_URL?.trim();
  const origin = new URL(configured || requestUrl).origin;
  const rpID = env.WEBAUTHN_RP_ID?.trim() || new URL(origin).hostname;
  return { rpID, origin, rpName: "LifeFlow" };
}

const uuidBytes = (id: string) => Uint8Array.from(Buffer.from(id.replace(/-/g, ""), "hex"));
const uuidFromHandle = (handle: string) => {
  const hex = Buffer.from(handle, "base64url").toString("hex");
  return hex.length === 32 ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : null;
};

/** A friendly default name from the browser, e.g. "iPhone" or "Mac (Chrome)". */
export function passkeyNameFrom(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const device = /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /Linux/.test(ua) ? "Linux PC" : "This device";
  return browser ? `${device} (${browser})` : device;
}

export const passkeyNameSchema = z.string().trim().min(1, "Give the passkey a name.").max(60, "Keep the name to 60 characters.");

export async function listPasskeys(db: Database, userId: string) {
  return db
    .select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt, backedUp: passkeys.backedUp })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(asc(passkeys.createdAt));
}

export async function renamePasskey(db: Database, userId: string, id: string, name: string) {
  const [row] = await db
    .update(passkeys)
    .set({ name: passkeyNameSchema.parse(name) })
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
    .returning({ id: passkeys.id });
  if (!row) throw new PasskeyError("That passkey wasn't found.");
}

export async function removePasskey(db: Database, userId: string, id: string) {
  const [row] = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
    .returning({ name: passkeys.name });
  if (!row) throw new PasskeyError("That passkey wasn't found.");
  return row.name;
}

// ---------------------------------------------------------------- registration

export async function startPasskeyRegistration(db: Database, userId: string, rp: RelyingParty) {
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
  if (!u) throw new PasskeyError("Account not found.");
  const existing = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, userId));
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: u.email,
    userDisplayName: u.name,
    userID: uuidBytes(userId),
    attestationType: "none",
    // Don't create a second passkey on an authenticator that already has one for this account.
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const { token, expiresAt } = await saveChallenge(db, "passkey-register", options.challenge, userId);
  return { options, token, expiresAt };
}

export async function finishPasskeyRegistration(
  db: Database,
  userId: string,
  token: string | undefined,
  response: RegistrationResponseJSON,
  rp: RelyingParty,
  name: string,
) {
  const ch = await takeChallenge(db, "passkey-register", token);
  if (!ch || ch.userId !== userId) throw new PasskeyError("This request expired. Try adding the passkey again.");
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("The passkey couldn't be verified. Try again.");
  }
  if (!result.verified) throw new PasskeyError("The passkey couldn't be verified. Try again.");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const [row] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? response.response.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: passkeyNameSchema.catch("Passkey").parse(name),
    })
    .onConflictDoNothing()
    .returning({ id: passkeys.id, name: passkeys.name });
  if (!row) throw new PasskeyError("This passkey is already saved.");
  return row;
}

// -------------------------------------------------------------- authentication

/**
 * Options for signing in (any passkey for this site; the browser offers the
 * ones it has) or, with `userId`, for confirming it's really that person
 * (unlocking Money).
 */
export async function startPasskeyAuthentication(db: Database, rp: RelyingParty, purpose: "passkey-login" | "passkey-unlock", userId: string | null = null) {
  const allow = userId ? await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, userId)) : [];
  if (userId && !allow.length) throw new PasskeyError("Add a passkey in Settings, Security first.");
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: allow.map((c) => ({ id: c.id, transports: c.transports })),
  });
  const { token, expiresAt } = await saveChallenge(db, purpose, options.challenge, userId);
  return { options, token, expiresAt };
}

export async function finishPasskeyAuthentication(
  db: Database,
  purpose: "passkey-login" | "passkey-unlock",
  token: string | undefined,
  response: AuthenticationResponseJSON,
  rp: RelyingParty,
) {
  const ch = await takeChallenge(db, purpose, token);
  if (!ch) throw new PasskeyError("This sign-in expired. Try again.");
  const [pk] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id));
  // Same message whether the passkey is unknown or belongs to someone else.
  if (!pk) throw new PasskeyError("That passkey isn't linked to a LifeFlow account. Sign in with your password, then add it in Settings.");
  if (ch.userId && ch.userId !== pk.userId) throw new PasskeyError("That passkey belongs to a different account.");
  if (response.response.userHandle && uuidFromHandle(response.response.userHandle) !== pk.userId) throw new PasskeyError("That passkey couldn't be verified.");
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: { id: pk.credentialId, publicKey: Uint8Array.from(Buffer.from(pk.publicKey, "base64url")), counter: pk.counter, transports: pk.transports },
    });
  } catch {
    throw new PasskeyError("That passkey couldn't be verified.");
  }
  if (!result.verified) throw new PasskeyError("That passkey couldn't be verified.");
  await db
    .update(passkeys)
    .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date(), backedUp: result.authenticationInfo.credentialBackedUp })
    .where(eq(passkeys.id, pk.id));
  return { userId: pk.userId, passkeyId: pk.id, name: pk.name };
}
