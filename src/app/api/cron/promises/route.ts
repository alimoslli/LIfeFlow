import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { pushImportant, runProactive } from "@/server/services/proactive/engine";
import { sendOnce, webPushSender } from "@/server/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Promise check-ins, every 30 minutes: asks "Did you?" for promises whose time has come, and says something good when a to-do
 * that a promise was about is finished. Nothing is kept or broken here; only the person's answer (or their finished to-do) does that.
 * Pushes follow the usual limits and quiet hours. Called with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const send = await webPushSender();
    const all = await getDb().select({ id: users.id, tz: users.timezone, prefs: users.preferences, kind: users.accountKind }).from(users);
    let messages = 0;
    let sent = 0;
    for (const u of all) {
      if (u.kind === "demo") continue;
      try {
        const made = await withUser(u.id, (s) => runProactive({ scope: s, tz: u.tz, prefs: u.prefs, trigger: "promise" }));
        messages += made.length;
        if (made.length && send) sent += await withUser(u.id, (s) => pushImportant(s, u.tz, u.prefs, (key, msg) => sendOnce(s, key, msg, send)));
      } catch {}
    }
    return NextResponse.json({ ok: true, users: all.length, messages, sent });
  } catch (e) {
    return errorResponse(e);
  }
}
