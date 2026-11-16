import { and, eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { pickNextUp, nextUpText } from "@/lib/next-up";
import { jarvisMessages } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { getAgenda } from "./calendar";

/** `topics` are what the note talks about, in the clouds' terms (lib/insights.ts), so no cloud says it again. */
export type NextUpNote = { key: string; text: string; href: string; due: boolean; topics: string[] };

/** Today's note (lib/next-up.ts): the next real thing in the next 24 hours, from every source on the agenda. */
export async function nextUpNote(scope: UserScope, tz: string, now: Date = new Date()): Promise<NextUpNote | null> {
  const today = todayIn(tz, now);
  const items = await getAgenda(scope, tz, today, addDaysStr(today, 1), { now });
  const n = pickNextUp(items, now, tz);
  if (!n) return null;
  const deadlines = n.dues;
  const topics = deadlines.length ? ["due", ...deadlines.map((d) => `due:${d.title.toLowerCase()}`)] : [];
  return { key: n.item.key, text: nextUpText(n, tz, now), href: n.item.href, due: n.due, topics };
}

/** Until noon, Today carries the morning brief (owner, 2026-11-16, item 1: it moves there from Updates). */
export const BRIEF_UNTIL_HOUR = 12;

/**
 * This morning's brief, as one short line under the note: "3 things on today's list, $420 available now". Only the one
 * the skyling really wrote today (its stored facts), never made up here; the money part stays out under the Money lock.
 */
export async function morningBriefLine(scope: UserScope, tz: string, now: Date, opts: { money: boolean }): Promise<string | null> {
  const today = todayIn(tz, now);
  const [rows] = await series(() =>
    scope.tx
      .select({ facts: jarvisMessages.facts, status: jarvisMessages.status })
      .from(jarvisMessages)
      .where(and(eq(jarvisMessages.userId, scope.userId), eq(jarvisMessages.dedupeKey, `morning_brief:${today}`)))
      .limit(1),
  );
  const f = rows[0]?.facts;
  if (!f || rows[0].status === "dismissed") return null;
  const money = opts.money && typeof f.money === "string" ? f.money : null;
  // the things themselves, never a count (two test students, 2026-11-16: "N things on today's list" never helped)
  const sections = Array.isArray(f.sections) ? (f.sections as { heading?: string; lines?: unknown[] }[]) : [];
  const due = (sections.find((x) => x.heading === "Due")?.lines ?? []).filter((l): l is string => typeof l === "string" && l !== "Nothing due today.");
  const list = due.length ? `${due.slice(0, 2).join(", ")}${due.length > 2 ? ` and ${due.length - 2} more` : ""}` : "A clear day";
  return money ? `${list}. ${money[0].toUpperCase()}${money.slice(1)}` : list;
}
