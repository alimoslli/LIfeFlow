import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { markNeedsReauth, ownerOfItem, syncConnection, verifyWebhook } from "@/server/integrations/plaid";

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
        markNeedsReauth(s, owner.integrationId, event.error?.display_message || "Your bank needs you to sign in again. Use Reconnect."),
      );
    } else if ((type === "TRANSACTIONS" || type === "HOLDINGS" || type === "LIABILITIES") && SYNC.has(code)) {
      await syncConnection(owner.userId, owner.integrationId, u?.tz ?? "UTC").catch(() => undefined); // errors are recorded on the connection
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
