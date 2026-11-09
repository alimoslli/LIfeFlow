import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { integrations } from "../db/schema";
import { withUser } from "../db/with-user";
import { recordError } from "./error-reports";

/**
 * Before an account is deleted, close what lives outside our database.
 *
 * - Stripe first: a live subscription that can't be cancelled REFUSES the deletion (`DeletionBlockedError`) before anything
 *   else is revoked, so the person is never left paying for a deleted account.
 * - Plaid (/item/remove per bank link) and Google (revoke the stored grant) run in parallel under one deadline. They are best
 *   effort: a failure is recorded (fixed text, no ids, no user content) and deletion goes on.
 * - Microsoft: no simple revoke endpoint; the tokens are deleted with the rows (the person can remove the app at account.microsoft.com).
 * - Sign in with Apple: the refresh token stored (encrypted) at sign-in or linking is revoked at Apple's /auth/revoke, in the same
 *   parallel, best-effort step. No stored token means no call.
 */
export type CleanupDeps = { fetch?: typeof fetch; deadlineMs?: number; apple?: import("../auth/apple").AppleConfig | null };

/** Thrown when a live subscription could not be cancelled: the deletion must not go ahead (the person would keep paying). */
export class DeletionBlockedError extends Error {
  constructor() {
    super("We couldn't cancel your plan just now, so your account wasn't deleted. Try again in a minute.");
  }
}

const DEADLINE_MS = 8_000;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("deadline")), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

export async function revokeOutsideAccess(db: Database, user: { id: string; stripeCustomerId: string | null }, deps: CleanupDeps = {}) {
  const base = deps.fetch ?? fetch;
  const deadlineMs = deps.deadlineMs ?? DEADLINE_MS;
  const f: typeof fetch = (input, init) => base(input, { ...init, signal: AbortSignal.timeout(deadlineMs) });
  const fail = async (what: string) => {
    try {
      await recordError(db, { source: "server", route: "account.delete", message: `Account deletion: ${what} failed` });
    } catch {
      // Recording must never block deletion either.
    }
  };

  // Stripe first: if the plan can't be cancelled, refuse before anything else is revoked.
  // Billing, Plaid and Google are loaded where they are used, not at the top: they pull in Next-only modules, and the deploy scripts
  // (seed-demo) import this file through accounts.ts under plain tsx, where those modules crash the production build.
  const { billingConfig, cancelSubscriptionsNow } = await import("../billing");
  const cfg = billingConfig();
  if (cfg && user.stripeCustomerId) {
    try {
      await withDeadline(cancelSubscriptionsNow(cfg, user.stripeCustomerId, f), deadlineMs);
    } catch {
      await fail("subscription cancel");
      throw new DeletionBlockedError();
    }
  }

  let rows: { provider: string; encryptedCredentials: string | null }[] = [];
  try {
    rows = await withUser(
      user.id,
      (s) =>
        s.tx
          .select({ provider: integrations.provider, encryptedCredentials: integrations.encryptedCredentials })
          .from(integrations)
          // RLS already limits this to the user; the explicit filter is a second lock.
          .where(and(eq(integrations.userId, user.id), inArray(integrations.provider, ["plaid", "google", "google_calendar", "gmail"]))),
      db,
    );
  } catch {
    await fail("reading connections");
  }

  const jobs = rows.map(async (row) => {
    try {
      if (row.provider === "plaid") await (await import("../integrations/plaid")).removeAtPlaid(row.encryptedCredentials, f);
      else await (await import("../integrations/google")).revokeGoogleGrant(row.encryptedCredentials, f);
    } catch {
      await fail(row.provider === "plaid" ? "bank link removal" : "Google revoke");
    }
  });
  // Apple: oauth_identities is not user-RLS (sign-in reads it before a session exists), so filter by user id explicitly.
  let appleTokens: string[] = [];
  try {
    const { oauthIdentities } = await import("../db/schema");
    const found = await db
      .select({ t: oauthIdentities.encryptedRefreshToken })
      .from(oauthIdentities)
      .where(and(eq(oauthIdentities.userId, user.id), eq(oauthIdentities.provider, "apple")));
    appleTokens = found.map((r) => r.t).filter((t): t is string => !!t);
  } catch {
    await fail("reading Apple link");
  }
  if (appleTokens.length) {
    const apple = await import("../auth/apple");
    const cfg = deps.apple === undefined ? apple.appleConfig() : deps.apple;
    for (const t of appleTokens)
      jobs.push(
        (async () => {
          try {
            if (!cfg) throw new Error("not configured");
            await apple.revokeAppleToken(cfg, t, f);
          } catch {
            await fail("Apple revoke");
          }
        })(),
      );
  }
  try {
    await withDeadline(Promise.allSettled(jobs), deadlineMs);
  } catch {
    await fail("revocation deadline");
  }
}
