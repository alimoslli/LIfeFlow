import { eq } from "drizzle-orm";
import { localDateOf } from "@/lib/dates";
import { starLabel } from "@/lib/stars";
import { users } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { getAgenda, type AgendaItem } from "./calendar";

/** A star to claim: what it was for, and when the skyling passed it. */
export type Star = { key: string; title: string; label: string; at: string };

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
      return { key: i.key, title, label: starLabel(title, i.kind), at: i.endsAt!.toISOString() };
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
  return passedStars(items, from, now);
}
