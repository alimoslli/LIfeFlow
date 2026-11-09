import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withJobLock } from "@/server/db/job-lock";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { pushImportant, runProactive } from "@/server/services/proactive/engine";
import { recordError } from "@/server/services/error-reports";
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
    const locked = await withJobLock("cron:promises", runPromises, { alertAfterSkips: 3, route: "/api/cron/promises" });
    if (locked.skipped) return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: true, ...locked.value });
  } catch (e) {
    return errorResponse(e);
  }
}

async function runPromises() {
  const send = await webPushSender();
  const all = await getDb().select({ id: users.id, tz: users.timezone, prefs: users.preferences, kind: users.accountKind }).from(users);
  let messages = 0;
  let sent = 0;
  let failed = 0;
  for (const u of all) {
    if (u.kind === "demo") continue;
    try {
      const made = await withUser(u.id, (s) => runProactive({ scope: s, tz: u.tz, prefs: u.prefs, trigger: "promise" }));
      messages += made.length;
      if (made.length && send) sent += await withUser(u.id, (s) => pushImportant(s, u.tz, u.prefs, (key, msg) => sendOnce(s, key, msg, send)));
    } catch (e) {
      // One person's failure must not stop the rest. Record the kind of error only: no ids, no text from the error.
      failed++;
      await recordError(getDb(), {
        source: "server",
        route: "/api/cron/promises",
        message: `promise check-in failed for a user: ${e instanceof Error ? e.name : "Error"}`,
      }).catch(() => {});
    }
  }
  return { users: all.length, messages, sent, failed };
}
