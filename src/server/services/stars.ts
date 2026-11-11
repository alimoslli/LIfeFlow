import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { localDateOf, localTimeOf } from "@/lib/dates";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { starLabel, starPush } from "@/lib/stars";
import { notificationLog, users, type UserPreferences } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { getAgenda, type AgendaItem } from "./calendar";
import { awardStars } from "./sky-home";
import { inQuietHours, jarvisSettings } from "./proactive/engine";
import { listSubscriptions, notificationPrefs, sendOnce, type Sender } from "./push";

/** A star to claim: what it was for, and when the skyling passed it. */
export type Star = { key: string; title: string; kind: string; label: string; at: string };

/** Coming back after days, only the last two are claimed (the run stays short and about now). */
const WINDOW_MS = 48 * 3_600_000;

/**
 * Stars for what the skyling passed on the sky: classes, shifts and plans whose time ended in (from, now], oldest first.
 * Never a deadline: a due date passing isn't done. To-dos and assignments get their star when ticked, not here.
 */
export function passedStars(items: AgendaItem[], from: Date, now: Date): Star[] {
  return items
    .filter((i) => i.blocksTime && !i.allDay && i.endsAt && i.endsAt > from && i.endsAt <= now && (i.origin === "event" || i.origin === "shift"))
    .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())
    .map((i) => {
      const title = i.origin === "shift" ? i.title.replace(/^Work · /, "") : i.title;
      return { key: i.key, title, kind: i.kind, label: starLabel(title, i.kind), at: i.endsAt!.toISOString() };
    });
}

/**
 * Claims the stars once, for every device: what passed since the last claim comes back and the claim moves to now in
 * the same transaction (the row is locked, so two tabs can't both get them). The first visit claims nothing.
 */
export async function claimStars(scope: UserScope, tz: string, now = new Date()): Promise<Star[]> {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("update");
  const last = u.preferences.starsClaimedAt ? new Date(u.preferences.starsClaimedAt) : null;
  await scope.tx
    .update(users)
    .set({ preferences: { ...u.preferences, starsClaimedAt: now.toISOString() } })
    .where(eq(users.id, scope.userId));
  if (!last || Number.isNaN(last.getTime()) || last >= now) return [];
  const from = new Date(Math.max(last.getTime(), now.getTime() - WINDOW_MS));
  const items = await getAgenda(scope, tz, localDateOf(from, tz), localDateOf(now, tz), { now, include: ["event", "shift"] });
  const stars = passedStars(items, from, now);
  // each claimed star stays on the skyling's cloud (owner, 2026-11-11)
  await awardStars(
    scope,
    stars.map((s) => `sky:${s.key}`),
    now,
  );
  return stars;
}

/** How far back a run looks for things that just ended (the job runs every 5 minutes; each thing is noted once). */
const JUST_ENDED_MS = 15 * 60_000;
/** A safety ceiling for these notes in 24 hours; they don't use the skyling's own limit. */
export const STAR_PUSHES_A_DAY = 4;

/**
 * The note when a class, shift or plan ends (owner, 2026-11-10: "if my shift ends at 6, a notification from around 6 to
 * 6:05 ... a small dopamine effect"): one line that it's over and a star is waiting; the tap opens Today, where it's
 * claimed. Never in quiet hours (it isn't held for the morning), never twice for the same thing (each one is logged),
 * things ending in the same run are one note, at most STAR_PUSHES_A_DAY a day, off with Settings › Notifications. Only
 * for someone who has had stars on Today (`starsClaimedAt`), and never for what they already claimed by being there.
 */
export async function pushStars(scope: UserScope, tz: string, prefs: UserPreferences | undefined, send: Sender, now = new Date()) {
  if (!notificationPrefs(prefs).stars || !prefs?.starsClaimedAt) return 0;
  const s = jarvisSettings(prefs);
  // a skyling told to send nothing of its own (limit 0) sends no star notes either
  if (s.pushLimit <= 0 || s.mutedKinds.includes("star_ready") || inQuietHours(localTimeOf(now, tz), s.quietStart, s.quietEnd)) return 0;
  if (!(await listSubscriptions(scope)).length) return 0;
  const claimed = new Date(prefs.starsClaimedAt);
  const from = new Date(Math.max(Number.isNaN(claimed.getTime()) ? 0 : claimed.getTime(), now.getTime() - JUST_ENDED_MS));
  const items = passedStars(await getAgenda(scope, tz, localDateOf(from, tz), localDateOf(now, tz), { now, include: ["event", "shift"] }), from, now);
  if (!items.length) return 0;
  const keys = items.map((i) => `star:${i.key}`);
  const noted = new Set(
    (
      await scope.tx
        .select({ key: notificationLog.key })
        .from(notificationLog)
        .where(and(eq(notificationLog.userId, scope.userId), inArray(notificationLog.key, keys)))
    ).map((r) => r.key),
  );
  const fresh = items.filter((i) => !noted.has(`star:${i.key}`));
  if (!fresh.length) return 0;
  const [{ today }] = await scope.tx
    .select({ today: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, scope.userId),
        like(notificationLog.key, "starnote:%"),
        gte(notificationLog.sentAt, new Date(now.getTime() - 24 * 3_600_000)),
      ),
    );
  // each thing is noted once even when the ceiling holds the note back: it's still claimed on Today
  await scope.tx
    .insert(notificationLog)
    .values(fresh.map((i) => ({ userId: scope.userId, key: `star:${i.key}`, title: "star" })))
    .onConflictDoNothing();
  if (today >= STAR_PUSHES_A_DAY) return 0;
  const name = nameAtStart(assistantProfile(prefs, tz).name);
  const { title, body } = starPush(name, fresh);
  return (await sendOnce(scope, `starnote:${fresh[0].key}`, { title, body, url: "/", tag: "lf-stars" }, send)) ? 1 : 0;
}
