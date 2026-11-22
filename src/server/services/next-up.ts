import { and, eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { focusHref, startable } from "@/lib/first-step";
import { laterText, pickNextUp, nextUpText, workDayLine } from "@/lib/next-up";
import { jarvisMessages } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { series } from "@/server/db/series";
import { getAgenda } from "./calendar";
import { listEmployers, listShifts } from "./work";

/** `topics` are what the note talks about, in the clouds' terms (lib/insights.ts), so no cloud says it again. */
/** `start` is the focus screen for the work the note names (lib/first-step.ts): the next thing itself when it's a to-do or
 * an assignment, else the first deadline riding along with a class or shift; none for a class, shift or meeting alone. */
export type NextUpNote = { key: string; text: string; href: string; due: boolean; topics: string[]; start?: string };

/** Today's note (lib/next-up.ts): the next real thing in the next 24 hours, from every source on the agenda; with nothing
 * that close, the soonest thing in the week after it (`laterText`). */
export async function nextUpNote(scope: UserScope, tz: string, now: Date = new Date()): Promise<NextUpNote | null> {
  const today = todayIn(tz, now);
  const items = await getAgenda(scope, tz, today, addDaysStr(today, 7), { now });
  const n = pickNextUp(items, now, tz);
  if (!n) {
    const later = laterText(items, now, tz);
    return later ? { key: later.item.key, text: later.text, href: later.item.href, due: false, topics: [] } : null;
  }
  const deadlines = n.dues;
  const topics = deadlines.length ? ["due", ...deadlines.map((d) => `due:${d.title.toLowerCase()}`)] : [];
  const work = [n.item, ...deadlines].find((i) => !i.done && startable(i.key));
  return { key: n.item.key, text: nextUpText(n, tz, now), href: n.item.href, due: n.due, topics, ...(work && { start: focusHref(work.key) }) };
}

/** Until noon, Today carries the morning brief (owner, 2026-11-16, item 1: it moves there from Updates). */
export const BRIEF_UNTIL_HOUR = 12;

/**
 * This morning's brief, as one short line under the note: "3 things on today's list, $420 available now". Only the one
 * the skyling really wrote today (its stored facts), never made up here; the money part stays out under the Money lock.
 */
export async function morningBriefLine(scope: UserScope, tz: string, now: Date, opts: { money: boolean; said?: string | null }): Promise<string | null> {
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
  const all = (sections.find((x) => x.heading === "Due")?.lines ?? []).filter((l): l is string => typeof l === "string" && l !== "Nothing due today.");
  // never what the note above it already says (owner, 2026-11-18, from the test students: the brief repeated the due
  // items word for word); what's left is the rest of the day's list and the money, or nothing at all
  const said = (opts.said ?? "").toLowerCase();
  const due = all.filter((l) => {
    const name = l
      .replace(/\s*\(.*$/, "")
      .replace(/\s+due\b.*$/i, "")
      .trim()
      .toLowerCase();
    return !(name && said.includes(name));
  });
  const cash = money ? `${money[0].toUpperCase()}${money.slice(1)}` : null;
  if (!due.length) return cash;
  const list = `${due.slice(0, 2).join(", ")}${due.length > 2 ? ` and ${due.length - 2} more` : ""}`;
  return cash ? `${list}. ${cash}` : list;
}

/** Today's work line (lib/next-up.ts `workDayLine`): the day's shift, or "No work today" on a usual work day. */
export async function workTodayLine(scope: UserScope, tz: string, now: Date, note?: string | null): Promise<string | null> {
  const today = todayIn(tz, now);
  const [jobs, shifts] = await series(
    () => listEmployers(scope),
    () => listShifts(scope, tz, addDaysStr(today, -28), today),
  );
  if (!jobs.length) return null;
  const mine = shifts.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, employer: s.employer.name }));
  return workDayLine(
    mine,
    mine.map((s) => s.startsAt),
    now,
    tz,
    note,
  );
}
