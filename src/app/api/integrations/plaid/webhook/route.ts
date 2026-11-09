import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withPlaidSyncLock } from "@/server/db/job-lock";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { markLoginRepaired, markNeedsReauth, ownerOfItem, recordNewAccountsAvailable, syncConnection, verifyWebhook } from "@/server/integrations/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNC = new Set(["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "TRANSACTIONS_REMOVED"]);

/**
 * Plaid tells us when new data is ready or a connection needs attention.
 * Every request must carry a valid Plaid-Verification signature over the
 * exact body; anything else is rejected. Public route (no session).
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 100_000) throw new HttpError(413, "Too large");
    if (!(await verifyWebhook(raw, req.headers.get("plaid-verification")))) throw new HttpError(401, "Invalid signature");
    const event = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { display_message?: string | null } | null };
    if (!event.item_id) return NextResponse.json({ ok: true });
    const owner = await ownerOfItem(getDb(), event.item_id);
    if (!owner) return NextResponse.json({ ok: true }); // unknown or already removed
    const [u] = await getDb().select({ tz: users.timezone }).from(users).where(eq(users.id, owner.userId));
    const type = event.webhook_type ?? "";
    const code = event.webhook_code ?? "";
    if (type === "ITEM" && (code === "ERROR" || code === "PENDING_EXPIRATION" || code === "USER_PERMISSION_REVOKED")) {
      await withUser(owner.userId, (s) =>
        markNeedsReauth(s, owner.integrationId, event.error?.display_message || "Your bank needs you to sign in again. Use Reconnect.", {
          stillWorking: code === "PENDING_EXPIRATION",
        }),
      );
    } else if (type === "ITEM" && code === "LOGIN_REPAIRED") {
      await withUser(owner.userId, (s) => markLoginRepaired(s, owner.integrationId));
      await syncOnce(owner.userId, owner.integrationId, u?.tz ?? "UTC");
    } else if (type === "ITEM" && code === "NEW_ACCOUNTS_AVAILABLE") {
      await withUser(owner.userId, (s) => recordNewAccountsAvailable(s, owner.integrationId));
    } else if ((type === "TRANSACTIONS" || type === "HOLDINGS" || type === "LIABILITIES") && SYNC.has(code)) {
      await syncOnce(owner.userId, owner.integrationId, u?.tz ?? "UTC"); // errors are recorded on the connection
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** One sync per connection at a time: a repeated webhook (or the cron) arriving mid-sync is skipped, the running one has the data. */
async function syncOnce(userId: string, integrationId: string, tz: string) {
  await withPlaidSyncLock(integrationId, () => syncConnection(userId, integrationId, tz).catch(() => undefined));
}
