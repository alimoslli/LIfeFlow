import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withJobLock } from "@/server/db/job-lock";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { recordError } from "@/server/services/error-reports";
import { webPushSender } from "@/server/services/push";
import { pushStars } from "@/server/services/stars";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Every 5 minutes (vercel.json): a short note when a class, shift or plan has just ended that its star is waiting on
 * Today (owner, 2026-11-10: a shift ending at 6 gets its note by about 6:05). All the rules are in `pushStars`: never in
 * quiet hours, once per thing, merged, a daily ceiling, a Settings switch. Called with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const locked = await withJobLock("cron:stars", runStars, { route: "/api/cron/stars" });
    if (locked.skipped) return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: true, ...locked.value });
  } catch (e) {
    return errorResponse(e);
  }
}

async function runStars() {
  const send = await webPushSender();
  if (!send) return { users: 0, sent: 0, push: "VAPID keys not configured" };
  const all = await getDb().select({ id: users.id, tz: users.timezone, prefs: users.preferences, kind: users.accountKind }).from(users);
  let sent = 0;
  let failed = 0;
  for (const u of all) {
    // the demo account, and an account locked under 13 (nothing of theirs is kept, and nothing is sent to them)
    if (u.kind === "demo" || u.prefs?.ageBlockedAt || !u.prefs?.starsClaimedAt) continue;
    try {
      sent += await withUser(u.id, (s) => pushStars(s, u.tz, u.prefs, send));
    } catch (e) {
      // One person's failure must not stop the rest. The kind of error only: no ids, no text from the error.
      failed++;
      await recordError(getDb(), {
        source: "server",
        route: "/api/cron/stars",
        message: `star note failed for a user: ${e instanceof Error ? e.name : "Error"}`,
      }).catch(() => {});
    }
  }
  return { users: all.length, sent, failed };
}
