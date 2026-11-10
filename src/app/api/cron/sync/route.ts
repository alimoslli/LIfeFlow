import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withJobLock, withPlaidSyncLock } from "@/server/db/job-lock";
import { connectionRegistry, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { syncGoogleCalendar, syncGoogleEmail } from "@/server/integrations/google";
import { microsoftNeedsReauth, syncMicrosoftConnection } from "@/server/integrations/microsoft";
import { plaidNeedsReauth, syncConnection } from "@/server/integrations/plaid";
import { markCanvasError, syncCanvas, withCanvasLock } from "@/server/integrations/canvas";
import { retryLockClosing } from "@/server/services/onboarding";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Refreshes every bank, calendar, and Gmail connection (Vercel Cron, see
 * vercel.json). Gmail keeps metadata for the newest 100 messages; bodies
 * remain in Gmail until they are specifically read. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const locked = await withJobLock("cron:sync", runSync, { route: "/api/cron/sync" });
    if (locked.skipped) return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: true, ...locked.value });
  } catch (e) {
    return errorResponse(e);
  }
}

async function runSync() {
  const rows = await getDb()
    .select({ userId: connectionRegistry.userId, integrationId: connectionRegistry.integrationId, provider: connectionRegistry.provider, tz: users.timezone })
    .from(connectionRegistry)
    // an account locked under 13 never syncs (its connections are being closed, below)
    .innerJoin(users, and(eq(users.id, connectionRegistry.userId), sql`not (${users.preferences} ? 'ageBlockedAt')`));
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of rows) {
    try {
      if (r.provider === "plaid") {
        // A connection waiting for the user to sign in again can't sync; skip it (no failed record every run) until Reconnect.
        if (await plaidNeedsReauth(r.userId, r.integrationId)) {
          skipped++;
          continue;
        }
        // The same connection may be syncing from a webhook right now; that run does the work.
        const done = await withPlaidSyncLock(r.integrationId, (live) => syncConnection(r.userId, r.integrationId, r.tz, undefined, { live }), {
          maxMs: 300_000,
        });
        if (done.skipped) {
          skipped++;
          continue;
        }
      } else if (r.provider === "google")
        await withUser(r.userId, async (s) => {
          await syncGoogleCalendar(s, r.tz);
          await syncGoogleEmail(s);
        });
      else if (r.provider === "outlook") {
        // Like Plaid: a connection waiting for Reconnect is skipped, and a failure is recorded on it (never stops the others).
        if (await microsoftNeedsReauth(r.userId)) {
          skipped++;
          continue;
        }
        await syncMicrosoftConnection(r.userId, r.tz);
      } else if (r.provider === "canvas")
      // Another run (the person's Sync now) already has this connection: skip it, that run is the sync.
      {
        const x = await withCanvasLock(r.userId, () => withUser(r.userId, (s) => syncCanvas(s, fetch, r.tz))).catch(async (e) => {
          await withUser(r.userId, (s) => markCanvasError(s, e));
          throw e;
        });
        if (x.skipped) {
          skipped++;
          continue;
        }
      }
      ok++;
    } catch {
      failed++; // the error is recorded on the connection for the user to see
    }
  }
  // bank and Google links of accounts locked under 13 that didn't close at the provider the first time
  const closing = await retryLockClosing(getDb()).catch(() => 0);
  return { synced: ok, failed, skipped, closing };
}
