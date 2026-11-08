import { inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { integrations } from "../db/schema";
import { withUser } from "../db/with-user";
import { billingConfig, cancelSubscriptionsNow } from "../billing";
import { revokeGoogleGrant } from "../integrations/google";
import { removeAtPlaid } from "../integrations/plaid";
import { recordError } from "./error-reports";

/**
 * Before an account is deleted, close what lives outside our database. Every call is best effort: the person asked to be
 * deleted, so a provider failure is recorded (fixed text, no ids, no user content) and deletion goes on.
 *
 * - Plaid: /item/remove for each bank link.
 * - Google (sign-in data, Gmail, Calendar): revoke the stored grant.
 * - Microsoft: no simple revoke endpoint; the tokens are deleted with the rows (the person can remove the app at account.microsoft.com).
 * - Stripe: cancel live subscriptions immediately.
 * - Sign in with Apple: we never store Apple's refresh token (only the id_token is read at sign-in), so there is nothing to revoke
 *   yet. Apple's /auth/revoke needs a stored refresh or access token; see the report for the follow-up mission.
 */
export type CleanupDeps = { fetch?: typeof fetch };

const TIMEOUT_MS = 8_000;

export async function revokeOutsideAccess(db: Database, user: { id: string; stripeCustomerId: string | null }, deps: CleanupDeps = {}) {
  const base = deps.fetch ?? fetch;
  const f: typeof fetch = (input, init) => base(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const fail = async (what: string) => {
    try {
      await recordError(db, { source: "server", route: "account.delete", message: `Account deletion: ${what} failed` });
    } catch {
      // Recording must never block deletion either.
    }
  };

  let rows: { provider: string; encryptedCredentials: string | null }[] = [];
  try {
    rows = await withUser(
      user.id,
      (s) =>
        s.tx
          .select({ provider: integrations.provider, encryptedCredentials: integrations.encryptedCredentials })
          .from(integrations)
          .where(inArray(integrations.provider, ["plaid", "google", "google_calendar", "gmail"])),
      db,
    );
  } catch {
    await fail("reading connections");
  }

  for (const row of rows) {
    if (row.provider === "plaid") {
      try {
        await removeAtPlaid(row.encryptedCredentials, f);
      } catch {
        await fail("bank link removal");
      }
    } else {
      try {
        await revokeGoogleGrant(row.encryptedCredentials, f);
      } catch {
        await fail("Google revoke");
      }
    }
  }

  const cfg = billingConfig();
  if (cfg && user.stripeCustomerId) {
    try {
      await cancelSubscriptionsNow(cfg, user.stripeCustomerId, f);
    } catch {
      await fail("subscription cancel");
    }
  }
}
