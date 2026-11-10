import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withJobLock } from "@/server/db/job-lock";
import { users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { purgeUnusedPreviews } from "@/server/services/hq-files";
import { purgeOldRateLimits } from "@/server/rate-limit";
import { pushImportant, runDueSlot } from "@/server/services/proactive/engine";
import { runNotifications, sendOnce, webPushSender } from "@/server/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Jarvis's scheduled looks (morning, midday, evening) for every user, then
 * pushes: to-do reminders, and Jarvis's urgent or important messages within the
 * user's daily limit and outside quiet hours. Runs every 10 minutes (vercel.json),
 * so a reminder arrives within minutes of its time: each slot runs once a day, at
 * its own time (`scheduledFrom`), and each push is sent at most once.
 * Called with `Authorization: Bearer <CRON_SECRET>` by Vercel Cron or any scheduler.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Unauthorized");
    const locked = await withJobLock("cron:notify", runNotify, { route: "/api/cron/notify" });
    if (locked.skipped) return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: true, ...locked.value });
  } catch (e) {
    return errorResponse(e);
  }
}

async function runNotify() {
  const send = await webPushSender();
  const all = await getDb().select({ id: users.id, tz: users.timezone, prefs: users.preferences, kind: users.accountKind }).from(users);
  let messages = 0;
  let sent = 0;
  for (const u of all) {
    // the demo account, and an account locked under 13 (nothing of theirs is kept, and nothing is sent to them)
    if (u.kind === "demo" || u.prefs?.ageBlockedAt) continue;
    // Separate transactions: one user's (or one step's) failure never blocks the rest.
    try {
      messages += (await withUser(u.id, (s) => runDueSlot(s, u.tz, u.prefs, new Date(), { scheduled: true }))).length;
    } catch {}
    if (!send) continue;
    try {
      sent += (await withUser(u.id, (s) => runNotifications(s, u.tz, u.prefs, send))).sent;
      sent += await withUser(u.id, (s) => pushImportant(s, u.tz, u.prefs, (key, msg) => sendOnce(s, key, msg, send)));
    } catch {}
  }
  // Housekeeping that must not depend on sign-ins: old limit buckets, Stop and continuation marks.
  await purgeOldRateLimits(getDb()).catch(() => undefined);
  // HQ housekeeping: pictures no decision card uses any more. Never blocks the run.
  try {
    await purgeUnusedPreviews(getDb());
  } catch {}
  return { users: all.length, messages, sent, push: send ? "on" : "VAPID keys not configured" };
}
