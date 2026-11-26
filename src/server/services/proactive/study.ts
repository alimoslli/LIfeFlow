import { and, eq, inArray } from "drizzle-orm";
import { addDaysStr, daysBetween, formatDateStr, localDateOf, localTimeOf } from "@/lib/dates";
import { jarvisMessages, paperPacks, users } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { busyAgenda, freeSlots, type AgendaItem } from "../calendar";
import { listAssignments } from "../school";
import type { Candidate, Detector } from "./detectors";
import { lastMinutePattern } from "./reviews";
import { missedPractice } from "../practice";
import { courseLabel, examLabel } from "@/lib/course-label";

/**
 * Study time offered before it's needed (owner, 2026-11-12; docs/backlog/2026-11-12-useful-sky.md, parts 1 and 2):
 * - `examStudy`: an exam or quiz 2 to 7 days away with nothing booked for it gets one block of real free time before it.
 * - `startEarlier`: someone who usually finishes close to the deadline (their own completed work says so) gets an earlier
 *   start for a big piece of work. The words never name the habit; they say what the earlier start buys.
 * Facts only (wording in lib/jarvis-voice), "Block it" is the shared `block_time` action with Undo, each is offered once.
 */

/** The hours someone studies in, from their own setting; otherwise the day. */
const STUDY_HOURS = {
  morning: ["08:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  evening: ["17:00", "22:00"],
  night: ["19:00", "23:30"],
} as const;
const DAY = ["09:00", "21:00"] as const;

/** "9 AM", "3:30 PM". */
const clockOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const plusMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

async function studyHours(scope: UserScope) {
  const [u] = await scope.tx.select({ prefs: users.preferences }).from(users).where(eq(users.id, scope.userId));
  const pref = u?.prefs?.studyTime;
  return pref ? STUDY_HOURS[pref] : DAY;
}

async function alreadyOffered(scope: UserScope, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const rows = await scope.tx
    .select({ key: jarvisMessages.dedupeKey })
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), inArray(jarvisMessages.dedupeKey, keys)));
  return new Set(rows.map((r) => r.key));
}

/** A study event already on the calendar before `before`, whose title names the course or the piece of work. */
const bookedFor = (agenda: AgendaItem[], now: Date, before: Date, names: string[]) =>
  agenda.some(
    (i) =>
      i.origin === "event" &&
      i.kind === "study" &&
      i.startsAt > now &&
      i.startsAt < before &&
      names.some((n) => n.length >= 3 && i.title.toLowerCase().includes(n.toLowerCase())),
  );

/**
 * The latest day from `lastDay` back to today with `minutes` free inside the study hours; on that day the first such
 * stretch. Never the day the thing is due, never during a class, a shift or an event.
 */
function latestFree(agenda: AgendaItem[], tz: string, today: string, lastDay: string, hours: readonly [string, string], minutes: number, now: Date) {
  for (let d = lastDay; d >= today; d = addDaysStr(d, -1)) {
    const slot = freeSlots(agenda, d, tz, hours[0], hours[1], minutes, now)[0];
    if (slot) {
      const start = localTimeOf(slot.startsAt, tz).slice(0, 5);
      return { date: d, start, end: plusMinutes(start, minutes) };
    }
  }
  return null;
}

export const examStudy: Detector = async ({ scope, tz, today, now }) => {
  const exams = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 60 })).filter((a) => {
    if ((a.kind !== "exam" && a.kind !== "quiz") || !a.dueAt || a.dueAt <= now) return false;
    const away = daysBetween(today, localDateOf(a.dueAt, tz));
    return away >= 2 && away <= 7;
  });
  if (!exams.length) return [];
  const offered = await alreadyOffered(
    scope,
    exams.map((e) => `exam_study:${e.id}`),
  );
  const fresh = exams.filter((e) => !offered.has(`exam_study:${e.id}`));
  if (!fresh.length) return [];
  const hours = await studyHours(scope);
  const agenda = await busyAgenda(scope, tz, today, addDaysStr(today, 7), { now });
  const out: Candidate[] = [];
  for (const a of fresh.slice(0, 3)) {
    const course = courseLabel(a.course);
    const what = examLabel(course, a.kind, a.title);
    if (bookedFor(agenda, now, a.dueAt!, [course ?? a.title, a.course.name, a.title])) continue;
    const examDate = localDateOf(a.dueAt!, tz);
    const minutes = a.kind === "exam" ? 90 : 60;
    const block = latestFree(agenda, tz, today, addDaysStr(examDate, -1), hours, minutes, now);
    const facts = { course: course ?? "", what, kind: a.kind, exam: a.title, examDay: formatDateStr(examDate, "EEEE"), minutes };
    out.push(
      block
        ? {
            kind: "exam_study",
            topic: "school",
            dedupeKey: `exam_study:${a.id}`,
            facts: { ...facts, blockWhen: `${formatDateStr(block.date, "EEEE")} at ${clockOf(block.start)}` },
            action: { type: "block_time", label: "Block it", date: block.date, start: block.start, end: block.end, title: `Study for ${what}` },
            priority: 76,
          }
        : {
            kind: "exam_study",
            topic: "school",
            dedupeKey: `exam_study:${a.id}`,
            facts: { ...facts, noFreeBlock: true },
            action: { type: "open", label: "See my week", href: "/plan" },
            priority: 76,
          },
    );
  }
  return out.slice(0, 2);
};

/** Big pieces of work, where a late start costs the most. */
const BIG = /\b(essay|paper|report|project|presentation|thesis|portfolio|proposal|research)\b/i;

export const startEarlier: Detector = async (ctx) => {
  const { scope, tz, today, now } = ctx;
  const big = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 60 })).filter((a) => {
    if (!a.dueAt || a.dueAt <= now || a.kind === "exam" || a.kind === "quiz") return false;
    if (a.kind !== "project" && !BIG.test(a.title)) return false;
    const away = daysBetween(today, localDateOf(a.dueAt, tz));
    return away >= 3 && away <= 6;
  });
  if (!big.length) return [];
  const offered = await alreadyOffered(
    scope,
    big.map((a) => `start_earlier:${a.id}`),
  );
  const fresh = big.filter((a) => !offered.has(`start_earlier:${a.id}`));
  // only when it helps: their own finished work says they usually finish in the last day
  if (!fresh.length || !(await lastMinutePattern(ctx))) return [];
  const hours = await studyHours(scope);
  const agenda = await busyAgenda(scope, tz, today, addDaysStr(today, 7), { now });
  for (const a of fresh) {
    const course = courseLabel(a.course) ?? "";
    if (bookedFor(agenda, now, a.dueAt!, [a.title])) continue;
    const dueDate = localDateOf(a.dueAt!, tz);
    // at least two clear days before it's due
    const block = latestFree(agenda, tz, today, addDaysStr(dueDate, -2), hours, 90, now);
    if (!block) continue;
    return [
      {
        kind: "start_earlier",
        topic: "school",
        dedupeKey: `start_earlier:${a.id}`,
        facts: {
          assignment: a.title,
          course,
          dueDay: formatDateStr(dueDate, "EEEE"),
          blockWhen: `${formatDateStr(block.date, "EEEE")} at ${clockOf(block.start)}`,
          roomDays: daysBetween(block.date, dueDate),
        },
        action: { type: "block_time", label: "Block it", date: block.date, start: block.start, end: block.end, title: `Start ${a.title}` },
        priority: 60,
      },
    ];
  }
  return [];
};

/** Written work, where the hunting for sources is the hard first step. */
const WRITTEN = /\b(essay|paper|report|thesis|proposal|research|literature review|annotated bibliography)\b/i;

/**
 * Gamechanger 1 (owner, 2026-11-26: "3 days before it'll say ... and the skyling can assist ... do the research"): a paper,
 * essay or report due in 3 to 5 days with no pack yet gets one offer of a paper pack (sources and questions; the writing is
 * theirs, ADR 0016). The tap fills the bar, never sends, so a paid search only runs when they ask. Offered once.
 */
export const paperPackOffer: Detector = async ({ scope, tz, today, now }) => {
  const due = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 60 })).filter((a) => {
    if (!a.dueAt || a.dueAt <= now || a.kind === "exam" || a.kind === "quiz" || !WRITTEN.test(a.title)) return false;
    const away = daysBetween(today, localDateOf(a.dueAt, tz));
    return away >= 3 && away <= 5;
  });
  if (!due.length) return [];
  const offered = await alreadyOffered(
    scope,
    due.map((a) => `paper_pack:${a.id}`),
  );
  const packed = new Set((await scope.tx.select({ id: paperPacks.assignmentId }).from(paperPacks).where(eq(paperPacks.userId, scope.userId))).map((r) => r.id));
  const a = due.find((x) => !offered.has(`paper_pack:${x.id}`) && !packed.has(x.id));
  if (!a) return [];
  return [
    {
      kind: "paper_pack",
      topic: "school",
      dedupeKey: `paper_pack:${a.id}`,
      facts: { assignment: a.title, course: courseLabel(a.course) ?? "", dueDay: formatDateStr(localDateOf(a.dueAt!, tz), "EEEE") },
      action: { type: "ask", label: "Find sources", prompt: `Make me a paper pack for ${a.title}` },
      priority: 64,
    },
  ];
};

/**
 * Gamechanger 2 (owner, 2026-11-26): the evening before an exam or quiz, when practice rounds left questions they missed,
 * one offer of a short round on only those. The tap fills the bar. Offered once per exam.
 */
export const examEveReview: Detector = async ({ scope, tz, today, now }) => {
  const tomorrow = addDaysStr(today, 1);
  const exams = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 60 })).filter(
    (a) => (a.kind === "exam" || a.kind === "quiz") && a.dueAt && a.dueAt > now && localDateOf(a.dueAt, tz) === tomorrow,
  );
  if (!exams.length) return [];
  const offered = await alreadyOffered(
    scope,
    exams.map((e) => `exam_eve:${e.id}`),
  );
  for (const a of exams) {
    if (offered.has(`exam_eve:${a.id}`)) continue;
    const { missed } = await missedPractice(scope, a.id);
    if (!missed.length) continue;
    const what = examLabel(courseLabel(a.course), a.kind, a.title);
    return [
      {
        kind: "exam_eve",
        topic: "school",
        dedupeKey: `exam_eve:${a.id}`,
        facts: { what, missedCount: missed.length },
        action: { type: "ask", label: "Quiz me", prompt: `Quiz me on just the ones I missed for ${what}` },
        priority: 70,
      },
    ];
  }
  return [];
};
