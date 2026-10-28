import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { connectionRegistry, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { syncGoogleCalendar } from "@/server/integrations/google";
import { syncConnection } from "@/server/integrations/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nightly refresh of every bank and calendar connection (Vercel Cron, see
 * vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const rows = await getDb()
      .select({ userId: connectionRegistry.userId, integrationId: connectionRegistry.integrationId, provider: connectionRegistry.provider, tz: users.timezone })
      .from(connectionRegistry)
      .innerJoin(users, eq(users.id, connectionRegistry.userId));
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        if (r.provider === "plaid") await syncConnection(r.userId, r.integrationId, r.tz);
        else if (r.provider === "google") await withUser(r.userId, (s) => syncGoogleCalendar(s, r.tz));
        ok++;
      } catch {
        failed++; // the error is recorded on the connection for the user to see
      }
    }
    return NextResponse.json({ ok: true, synced: ok, failed });
  } catch (e) {
    return errorResponse(e);
  }
}
