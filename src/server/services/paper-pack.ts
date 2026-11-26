import { and, eq } from "drizzle-orm";
import { addDaysStr, daysBetween, formatDateStr, localDateOf, localTimeOf } from "@/lib/dates";
import { paperPacks, type PaperSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import type { WebAnswer } from "../integrations/web-search";
import { busyAgenda, freeSlots } from "./calendar";
import { getAssignment } from "./school";

/**
 * Paper pack (owner, 2026-11-26, gamechanger 1; docs/backlog/2026-11-26-gamechangers.md): for a paper, essay or report, the
 * skyling finds real sources (each one a page the search cited) and a few open questions to research, saves them, and our
 * code finds work sessions in the person's real free time before it's due. It never writes the paper, a thesis, an outline
 * or an argument (ADR 0016): the student does the thinking; the pack saves them the hunting.
 */

/** What the search is asked for. Sources and questions only. */
export const PACK_INSTRUCTIONS =
  "You are helping a student start their own research. Find 6 to 8 credible sources (scholarly articles, books, reputable organisations, quality journalism) that bear on the topic, and for each say in one short line what it covers. Then give 3 to 5 open research questions the student could look into. Never write any part of the paper: no thesis, no outline, no arguments, no paragraphs, no summary of what the paper should say.";

export const PACK_SCHEMA = {
  name: "paper_pack",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sources", "questions"],
    properties: {
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url", "why"],
          properties: { title: { type: "string" }, url: { type: "string" }, why: { type: "string" } },
        },
      },
      questions: { type: "array", items: { type: "string" } },
    },
  },
} as const;

/** The search query: what the work is, in the student's own course's words. */
export function packQuery(a: { title: string; description: string | null; course: { name: string } }, focus?: string | null) {
  const desc = (a.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  return [`Sources for a student's ${a.course.name} assignment: "${a.title}".`, focus ? `Their focus: ${focus}.` : "", desc ? `Brief: ${desc}` : ""]
    .filter(Boolean)
    .join(" ");
}

const sameUrl = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
};

/** Words that would mean the answer drifted into writing the paper; such a line is dropped. */
const WRITES_IT = /\b(thesis|outline|introduction|conclusion|paragraph|argue that|you (should|could) (write|argue|say)|in this (paper|essay))\b/i;

/**
 * Keeps only sources whose page the search itself cited (never a link the model made up), one per page, at most 8, and
 * questions that are questions. Pure; tested in tests/unit/paper-pack.test.ts.
 */
export function cleanPack(raw: unknown, cited: WebAnswer["sources"]): { sources: PaperSource[]; questions: string[] } {
  const r = (raw ?? {}) as { sources?: unknown; questions?: unknown };
  const sources: PaperSource[] = [];
  for (const s of Array.isArray(r.sources) ? r.sources : []) {
    const { title, url, why } = (s ?? {}) as Record<string, unknown>;
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    const hit = cited.find((c) => sameUrl(c.url, url));
    if (!hit || sources.some((x) => sameUrl(x.url, hit.url))) continue;
    const line = typeof why === "string" ? why.trim().slice(0, 200) : "";
    sources.push({
      title: (typeof title === "string" && title.trim() ? title.trim() : hit.title).slice(0, 200),
      url: hit.url,
      why: WRITES_IT.test(line) ? "" : line,
    });
    if (sources.length >= 8) break;
  }
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim().slice(0, 200))
    .filter((q) => q.endsWith("?") && !WRITES_IT.test(q))
    .slice(0, 5);
  return { sources, questions };
}

export async function getPaperPack(scope: UserScope, assignmentId: string) {
  const [row] = await scope.tx
    .select()
    .from(paperPacks)
    .where(and(eq(paperPacks.userId, scope.userId), eq(paperPacks.assignmentId, assignmentId)));
  return row ?? null;
}

/** Saves (or replaces) the pack for one piece of work the person owns. */
export async function savePaperPack(scope: UserScope, assignmentId: string, pack: { sources: PaperSource[]; questions: string[] }, searchedAt: Date) {
  await getAssignment(scope, assignmentId); // theirs, or not found (FK checks bypass RLS)
  const [row] = await scope.tx
    .insert(paperPacks)
    .values({ userId: scope.userId, assignmentId, sources: pack.sources, questions: pack.questions, searchedAt })
    .onConflictDoUpdate({
      target: [paperPacks.userId, paperPacks.assignmentId],
      set: { sources: pack.sources, questions: pack.questions, searchedAt, updatedAt: new Date() },
    })
    .returning();
  return row;
}

const clock = (d: Date, tz: string) => {
  const [h, m] = localTimeOf(d, tz).split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Up to three work sessions in real free time before it's due: one a day, from today to the day before, never during a
 * class, a shift or an event. Our code, not the model; offered, never booked without a yes.
 */
export async function packSessions(scope: UserScope, tz: string, dueAt: Date | null, now: Date, minutes = 60) {
  if (!dueAt || dueAt <= now) return [];
  const today = localDateOf(now, tz);
  const last = addDaysStr(localDateOf(dueAt, tz), -1);
  if (last < today) return [];
  const agenda = await busyAgenda(scope, tz, today, last, { now });
  const out: { date: string; start: string; end: string; when: string }[] = [];
  for (let d = today; d <= last && out.length < 3; d = addDaysStr(d, 1)) {
    const slot = freeSlots(agenda, d, tz, "09:00", "22:00", minutes, now)[0];
    if (!slot) continue;
    const end = new Date(slot.startsAt.getTime() + minutes * 60_000);
    out.push({
      date: d,
      start: localTimeOf(slot.startsAt, tz).slice(0, 5),
      end: localTimeOf(end, tz).slice(0, 5),
      when: `${daysBetween(today, d) === 0 ? "Today" : formatDateStr(d, "EEEE")} at ${clock(slot.startsAt, tz)}`,
    });
  }
  return out;
}
