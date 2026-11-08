import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { integrations } from "../db/schema";
import { withUser } from "../db/with-user";
import { billingConfig, cancelSubscriptionsNow } from "../billing";
import { revokeGoogleGrant } from "../integrations/google";
import { removeAtPlaid } from "../integrations/plaid";
import { recordError } from "./error-reports";

/**
 * Before an account is deleted, close what lives outside our database.
 *
 * - Stripe first: a live subscription that can't be cancelled REFUSES the deletion (`DeletionBlockedError`) before anything
 *   else is revoked, so the person is never left paying for a deleted account.
 * - Plaid (/item/remove per bank link) and Google (revoke the stored grant) run in parallel under one deadline. They are best
 *   effort: a failure is recorded (fixed text, no ids, no user content) and deletion goes on.
 * - Microsoft: no simple revoke endpoint; the tokens are deleted with the rows (the person can remove the app at account.microsoft.com).
 * - Sign in with Apple: we never store Apple's refresh token (only the id_token is read at sign-in), so there is nothing to revoke
 *   yet. Apple's /auth/revoke needs a stored refresh or access token.
 */
export type CleanupDeps = { fetch?: typeof fetch; deadlineMs?: number };

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
      if (row.provider === "plaid") await removeAtPlaid(row.encryptedCredentials, f);
      else await revokeGoogleGrant(row.encryptedCredentials, f);
    } catch {
      await fail(row.provider === "plaid" ? "bank link removal" : "Google revoke");
    }
  });
  try {
    await withDeadline(Promise.allSettled(jobs), deadlineMs);
  } catch {
    await fail("revocation deadline");
  }
}
