import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { oauthIdentities, users } from "../db/schema";
import { withUser } from "../db/with-user";
import { audit } from "../services/audit";
import { seedDefaultCategories } from "../services/finance/categories";
import { saveChallenge, takeChallenge } from "./challenges";

/**
 * Account rules shared by Sign in with Apple and Sign in with Google (ADR 0009).
 * The provider's stable user id ("sub") identifies the person. An email that
 * matches an existing account is never linked automatically: the person signs
 * in to that account once to confirm, then the provider is linked.
 */

export type OAuthProvider = "apple" | "google";
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { apple: "Apple", google: "Google" };
export type OAuthClaims = { sub: string; email: string | null; emailVerified: boolean; isPrivateEmail: boolean };

export class OAuthSignInError extends Error {}

export type OAuthOutcome =
  | { kind: "signed-in"; userId: string; totpEnabled: boolean }
  | { kind: "created"; userId: string }
  | { kind: "linked"; userId: string }
  | { kind: "link-required"; email: string; pendingToken: string; expiresAt: Date };

/** Holds the pending-link token while the person signs in to their existing account. */
export const OAUTH_LINK_COOKIE = "lf_apple_link";

/**
 * After the provider's token is verified. `state` is what the start step saved.
 * - Known id → sign in.
 * - "link" mode (from Settings, signed in) → link to that account.
 * - Email matches an existing account → ask them to sign in to it first.
 * - Otherwise → create the account.
 */
export async function completeOAuthSignIn(
  db: Database,
  provider: OAuthProvider,
  claims: OAuthClaims,
  state: { mode: "signin" | "link"; tz: string; userId: string | null },
  name: string | null,
  ErrorClass: new (m: string) => Error = OAuthSignInError,
): Promise<OAuthOutcome> {
  const label = PROVIDER_LABEL[provider];
  const [known] = await db
    .select({ userId: oauthIdentities.userId, totp: users.totpEnabledAt })
    .from(oauthIdentities)
    .innerJoin(users, eq(users.id, oauthIdentities.userId))
    .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, claims.sub)));

  if (state.mode === "link") {
    if (!state.userId) throw new ErrorClass(`Sign in first, then link ${label} from Settings.`);
    if (known && known.userId !== state.userId) throw new ErrorClass(`This ${label} account is already linked to another LifeFlow account.`);
    if (!known) await linkIdentity(db, provider, state.userId, claims);
    return { kind: "linked", userId: state.userId };
  }

  if (known) {
    await db
      .update(oauthIdentities)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, claims.sub)));
    return { kind: "signed-in", userId: known.userId, totpEnabled: !!known.totp };
  }

  if (!claims.email || !claims.emailVerified) throw new ErrorClass(`${label} didn't share a verified email address, so an account can't be created.`);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, claims.email));
  if (existing) {
    const { token, expiresAt } = await saveChallenge(db, "oauth-link", JSON.stringify({ provider, pendingLink: claims }), existing.id, 15 * 60_000);
    return { kind: "link-required", email: claims.email, pendingToken: token, expiresAt };
  }

  const [user] = await db
    .insert(users)
    .values({
      name: name ?? claims.email.split("@")[0].slice(0, 80),
      email: claims.email,
      // No password yet ("Forgot password" or Settings can set one). Never matches a password check.
      passwordHash: `!${provider}`,
      timezone: state.tz,
      preferences: { onboarding: "pending" },
    })
    .returning({ id: users.id });
  await withUser(
    user.id,
    async (s) => {
      await seedDefaultCategories(s);
      await audit(s, "user", "account.created", undefined, { method: provider, privateEmail: claims.isPrivateEmail });
    },
    db,
  );
  await linkIdentity(db, provider, user.id, claims);
  return { kind: "created", userId: user.id };
}

async function linkIdentity(db: Database, provider: OAuthProvider, userId: string, claims: OAuthClaims) {
  await db
    .insert(oauthIdentities)
    .values({ userId, provider, subject: claims.sub, email: claims.email, isPrivateEmail: claims.isPrivateEmail, lastUsedAt: new Date() });
  await withUser(userId, (s) => audit(s, "user", `auth.${provider}_linked`, undefined, { privateEmail: claims.isPrivateEmail }), db);
}

/** After someone signs in to an existing account: if they came from Apple or Google for that same account, link it now. */
export async function consumePendingOAuthLink(db: Database, userId: string) {
  const jar = await cookies();
  const token = jar.get(OAUTH_LINK_COOKIE)?.value;
  if (!token) return false;
  jar.delete(OAUTH_LINK_COOKIE);
  return linkPendingOAuth(db, userId, token);
}

/** The cookie-free part of consumePendingOAuthLink. Only links to the account the provider's email matched. */
export async function linkPendingOAuth(db: Database, userId: string, token: string) {
  const ch = await takeChallenge(db, "oauth-link", token);
  if (!ch || ch.userId !== userId) return false;
  const { provider = "apple", pendingLink } = JSON.parse(ch.challenge) as { provider?: OAuthProvider; pendingLink?: OAuthClaims };
  if (!pendingLink) return false;
  const [taken] = await db
    .select({ id: oauthIdentities.id })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, pendingLink.sub)));
  if (taken) return false;
  await linkIdentity(db, provider, userId, pendingLink);
  return true;
}

export async function identityFor(db: Database, userId: string, provider: OAuthProvider) {
  const [row] = await db
    .select({ email: oauthIdentities.email, isPrivateEmail: oauthIdentities.isPrivateEmail, createdAt: oauthIdentities.createdAt })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.userId, userId), eq(oauthIdentities.provider, provider)));
  return row ?? null;
}

/** Unlinking needs a password or another linked provider, so the person can still sign in. */
export async function unlinkIdentity(db: Database, userId: string, provider: OAuthProvider, ErrorClass: new (m: string) => Error = OAuthSignInError) {
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  const others = await db.select({ provider: oauthIdentities.provider }).from(oauthIdentities).where(eq(oauthIdentities.userId, userId));
  if (!u?.hash.startsWith("scrypt$") && !others.some((o) => o.provider !== provider))
    throw new ErrorClass(`Set a password first, so you can still sign in after unlinking ${PROVIDER_LABEL[provider]}.`);
  await db.delete(oauthIdentities).where(and(eq(oauthIdentities.userId, userId), eq(oauthIdentities.provider, provider)));
}
