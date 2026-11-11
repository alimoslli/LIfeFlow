import { and, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { localDateOf, startOfLocalDay } from "@/lib/dates";
import type { SkyCounts } from "@/lib/sky-home";
import { skyRewards, users } from "../db/schema";
import type { UserScope } from "../db/with-user";

/**
 * Stars and suns for the skyling's cloud (owner, 2026-11-11). One row per thing earned (`sky_rewards`, unique by key), so
 * nothing counts twice, and undoing the thing takes its row back. Only real records earn anything: a class, shift or
 * plan the skyling passed (claimed on Today), a to-do or assignment ticked, a goal reached, a milestone that just
 * happened. Never a guess, never a deadline passing.
 */

/** Ticked to-dos and assignments earn at most this many stars a day, so a list of tiny ticks can't fill the cloud. */
export const TICK_STARS_A_DAY = 30;
/** Suns are for the big things: at most this many a day, whatever earns them. */
export const SUNS_A_DAY = 2;
/** A milestone earns a sun only when it just happened (or has no date): adding last year's never does. */
const MILESTONE_FRESH_DAYS = 30;

async function earnedToday(scope: UserScope, tz: string, now: Date, where: ReturnType<typeof and>) {
  const [{ n }] = await scope.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(skyRewards)
    .where(and(eq(skyRewards.userId, scope.userId), gte(skyRewards.earnedAt, startOfLocalDay(localDateOf(now, tz), tz)), where));
  return n;
}

/** The person's own time zone, for "a day" (services that don't carry one). */
async function tzOf(scope: UserScope) {
  const [u] = await scope.tx.select({ tz: users.timezone }).from(users).where(eq(users.id, scope.userId));
  return u?.tz || "UTC";
}

async function insert(scope: UserScope, kind: "star" | "sun", key: string, now: Date) {
  const rows = await scope.tx
    .insert(skyRewards)
    .values({ userId: scope.userId, kind, key, earnedAt: now })
    .onConflictDoNothing()
    .returning({ id: skyRewards.id });
  return rows.length > 0;
}

/** A star for `key` ("task:<id>", "assignment:<id>", "sky:<agenda key>"). True only when it's new. */
export async function awardStar(scope: UserScope, key: string, tz: string, now = new Date()) {
  const tick = key.startsWith("task:") || key.startsWith("assignment:");
  if (tick && (await earnedToday(scope, tz, now, or(like(skyRewards.key, "task:%"), like(skyRewards.key, "assignment:%")))) >= TICK_STARS_A_DAY) return false;
  return insert(scope, "star", key, now);
}

/** Stars for everything claimed on Today at once. */
export async function awardStars(scope: UserScope, keys: string[], now = new Date()) {
  if (!keys.length) return 0;
  const rows = await scope.tx
    .insert(skyRewards)
    .values(keys.map((key) => ({ userId: scope.userId, kind: "star" as const, key, earnedAt: now })))
    .onConflictDoNothing()
    .returning({ id: skyRewards.id });
  return rows.length;
}

/**
 * A sun for `key` ("goal:<id>", "money-goal:<id>", "milestone:<id>"). True only when it's new and the day still has
 * room: the caller plays the sun only then, and a star otherwise (the sun means a sun was earned).
 */
export async function awardSun(scope: UserScope, key: string, tz?: string, now = new Date()) {
  const zone = tz ?? (await tzOf(scope));
  if ((await earnedToday(scope, zone, now, eq(skyRewards.kind, "sun"))) >= SUNS_A_DAY) return false;
  return insert(scope, "sun", key, now);
}

/** A milestone's sun: only one that just happened (or has no date), and never one brought in from an import. */
export async function awardMilestoneSun(scope: UserScope, m: { id: string; happenedOn: string | null; source: string }, tz?: string, now = new Date()) {
  if (m.source === "import") return false;
  const zone = tz ?? (await tzOf(scope));
  if (m.happenedOn) {
    const today = localDateOf(now, zone);
    const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${m.happenedOn}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > MILESTONE_FRESH_DAYS) return false;
  }
  return awardSun(scope, `milestone:${m.id}`, zone, now);
}

/** Undo: the thing that earned it was unticked, set back or deleted. */
export async function takeBack(scope: UserScope, ...keys: string[]) {
  if (!keys.length) return;
  await scope.tx.delete(skyRewards).where(and(eq(skyRewards.userId, scope.userId), inArray(skyRewards.key, keys)));
}

/** How many stars and suns the cloud has. */
export async function skyCounts(scope: UserScope): Promise<SkyCounts> {
  const rows = await scope.tx
    .select({ kind: skyRewards.kind, n: sql<number>`count(*)::int` })
    .from(skyRewards)
    .where(eq(skyRewards.userId, scope.userId))
    .groupBy(skyRewards.kind);
  return { stars: rows.find((r) => r.kind === "star")?.n ?? 0, suns: rows.find((r) => r.kind === "sun")?.n ?? 0 };
}
