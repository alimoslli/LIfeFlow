import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { runNotifications, webPushSender } from "@/server/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sends due reminders, bill alerts, morning briefs and budget alerts. Safe to
 * call often (every 5 to 15 minutes): each notification is sent at most once.
 * Called with `Authorization: Bearer <CRON_SECRET>` by Vercel Cron or any scheduler.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const send = await webPushSender();
    if (!send) return NextResponse.json({ ok: true, skipped: "VAPID keys not configured" });
    const all = await getDb().select({ id: users.id, tz: users.timezone, prefs: users.preferences }).from(users);
    let sent = 0;
    for (const u of all) {
      try {
        sent += (await withUser(u.id, (s) => runNotifications(s, u.tz, u.prefs, send))).sent;
      } catch {
        // one user's failure never blocks the others
      }
    }
    return NextResponse.json({ ok: true, users: all.length, sent });
  } catch (e) {
    return errorResponse(e);
  }
}
