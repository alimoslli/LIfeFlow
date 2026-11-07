import { and, desc, eq, gte, inArray, isNotNull, notExists, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { hqApprovals, hqMissions, type HqLink } from "../db/schema";
import type { SinceLine, SinceLooked } from "../hq/types";
import { timed } from "../hq/validate";

/**
 * "Since you last looked" (ADR 0028): what the team fixed and found without needing the owner, and what reached the
 * app, from real HQ records only. Nothing is guessed or worded by an AI. The "how the app is running" line comes from
 * services/admin in the component, each part inside safe().
 */

const DAY = 24 * 3_600_000;
export const LOOKED_COOKIE = "hq_last_looked";
/**
 * The window this visit shows (ADR 0030): set on the first render of a visit to the last-looked value it used ("none" on a
 * first visit), so the 15 s refresh and coming back from another tab keep showing the same window. Gone when the owner
 * leaves the page, and after 2 hours at most.
 */
export const VISIT_COOKIE = "hq_looked_from";

/** The window start: the cookie's time when it is a real past time (never older than 30 days), else the last 7 days. */
export function sinceFrom(cookie: string | undefined, now: Date): Date {
  const week = new Date(now.getTime() - 7 * DAY);
  const ms = cookie && /^\d{10,14}$/.test(cookie) ? Number(cookie) : NaN;
  if (!Number.isFinite(ms) || ms > now.getTime()) return week;
  return new Date(Math.max(ms, now.getTime() - 30 * DAY));
}

/** A link that points at a commit (a /commit/ URL, or one labelled commit). */
export function commitUrlOf(links: HqLink[]): string | null {
  const l = links.find((x) => x.url.startsWith("https://") && (/\/commit\//.test(x.url) || /^commit\b/i.test(x.label)));
  return l?.url ?? null;
}

const MAX = 8;

export async function sinceLooked(db: Database, since: Date): Promise<SinceLooked> {
  return timed(db, async (tx) => {
    // Missions that needed no yes: no request of any kind (old or new) asked for them or builds them. Newest first.
    const anyAsk = tx
      .select({ x: sql`1` })
      .from(hqApprovals)
      .where(or(eq(hqApprovals.missionId, hqMissions.id), eq(hqApprovals.buildMissionId, hqMissions.id)));
    const fixedRows = await tx
      .select()
      .from(hqMissions)
      .where(and(eq(hqMissions.status, "done"), gte(hqMissions.doneAt, since), notExists(anyAsk)))
      .orderBy(desc(hqMissions.doneAt))
      .limit(MAX);
    const created = await tx
      .select()
      .from(hqMissions)
      .where(and(gte(hqMissions.createdAt, since), eq(hqMissions.source, "agent"), inArray(hqMissions.role, ["qa", "support", "researcher"])))
      .orderBy(desc(hqMissions.createdAt))
      .limit(MAX + 1);
    const live = await tx
      .select({ a: hqApprovals, m: hqMissions })
      .from(hqApprovals)
      .innerJoin(hqMissions, eq(hqApprovals.buildMissionId, hqMissions.id))
      .where(and(eq(hqApprovals.status, "approved"), isNotNull(hqApprovals.why), eq(hqMissions.status, "done"), gte(hqMissions.doneAt, since)))
      .orderBy(desc(hqMissions.doneAt))
      .limit(MAX + 1);

    const line = (text: string, at: Date, m: typeof hqMissions.$inferSelect | null, href: string | null): SinceLine => ({
      text,
      at,
      href,
      commitUrl: m ? commitUrlOf(m.links ?? []) : null,
      role: m?.role ?? null,
    });
    const fixed = fixedRows.map((m) => line(m.title, m.doneAt ?? m.updatedAt, m, `/admin/hq/missions/${m.id}`));
    // Asks that reached Live. A finished mission with a commit link and no ask shows in "fixed" with its commit link.
    const changed = live.map((l) => line(l.a.title, l.m.doneAt ?? l.m.updatedAt, l.m, `/admin/work#${l.a.id}`));
    const found = created.map((m) => line(m.title, m.createdAt, m, `/admin/hq/missions/${m.id}`));
    return { since, fixed: fixed.slice(0, MAX), found: found.slice(0, MAX), changed: changed.slice(0, MAX) };
  });
}
