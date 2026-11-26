import { and, eq } from "drizzle-orm";
import { formatDateStr, localDateOf, localTimeOf } from "@/lib/dates";
import { employers } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { getRecurring } from "./finance/planning";
import { getAssignment, getCourse } from "./school";
import { getShift } from "./work";

/**
 * Ready-to-send messages written by our code from real records (owner, 2026-11-26, gamechangers 3, 4 and 5): no AI call, no
 * made-up detail, and never sent for them. The skyling shows the text; the person copies it and sends it themselves.
 * Pure wording below (tested in tests/unit/drafts.test.ts); the loaders read only the person's own rows.
 */

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? " AM" : " PM"}`;
};
const range = (from: string, to: string) => `${clock(from).replace(/ (AM|PM)$/, clock(from).slice(-3) === clock(to).slice(-3) ? "" : " $1")} to ${clock(to)}`;
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export type ShiftSwapFacts = { workplace: string; shiftDay: string; shiftFrom: string; shiftTo: string; reason: string; reasonDay: string };

/** "Hi, I have my Bio final Thursday morning. Could anyone take my Wednesday 5 to 11 PM close?" */
export function shiftSwapText(f: ShiftSwapFacts) {
  return `Hi, I have ${f.reason} ${f.reasonDay}. Could anyone take my ${f.shiftDay} ${range(f.shiftFrom, f.shiftTo)} shift${f.workplace ? ` at ${f.workplace}` : ""}? I can cover one of yours another time. Thank you!`;
}

export type ExtensionFacts = { professor: string; course: string; title: string; dueDay: string; asked: string; done?: string | null; name: string };

/** A short, polite request with the real dates. What's done so far only when they said it. */
export function extensionEmail(f: ExtensionFacts) {
  const greeting = f.professor ? `Dear Professor ${f.professor.split(/\s+/).slice(-1)[0]},` : "Hello,";
  const subject = `Extension request: ${f.title}${f.course ? ` (${f.course})` : ""}`;
  const body = [
    greeting,
    "",
    `I'm writing to ask whether I could have an extension on ${f.title}, which is due ${f.dueDay}.${f.done ? ` So far I have ${f.done.replace(/\.$/, "")}.` : ""} Would ${f.asked} be possible?`,
    "",
    "Thank you for considering it.",
    "",
    "Best,",
    f.name,
  ].join("\n");
  return { subject, body };
}

export type BillMoveFacts = { biller: string; dueDay: string; payday?: string | null; name: string };

/** Asking a biller or landlord to move a due date to after the money comes in. Never an amount owed they didn't see. */
export function billMoveText(f: BillMoveFacts) {
  return `Hi, this is ${f.name}. My ${f.biller} payment is due ${f.dueDay}${f.payday ? `, and I'm paid ${f.payday}` : ""}. Could we move this month's due date${f.payday ? ` to ${f.payday}` : " back a few days"}? I'll pay in full then. Thank you!`;
}

// ---------------------------------------------------------------- from their records

const dayOf = (d: Date, tz: string) => formatDateStr(localDateOf(d, tz), "EEEE");
const partOfDay = (d: Date, tz: string) => {
  const h = Number(localTimeOf(d, tz).slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
};

export async function shiftSwapDraft(scope: UserScope, tz: string, shiftId: string, assignmentId: string) {
  const shift = await getShift(scope, shiftId);
  const work = await getAssignment(scope, assignmentId);
  const [job] = await scope.tx
    .select({ name: employers.name })
    .from(employers)
    .where(and(eq(employers.id, shift.employerId), eq(employers.userId, scope.userId)));
  const course = work.course.code ?? work.course.name;
  const what = work.kind === "exam" || work.kind === "quiz" ? `my ${course} ${work.kind}` : `${work.title} due for ${course}`;
  return shiftSwapText({
    workplace: job?.name ?? "",
    shiftDay: dayOf(shift.startsAt, tz),
    shiftFrom: localTimeOf(shift.startsAt, tz).slice(0, 5),
    shiftTo: localTimeOf(shift.endsAt, tz).slice(0, 5),
    reason: what,
    reasonDay: work.dueAt ? `${dayOf(work.dueAt, tz)} ${partOfDay(work.dueAt, tz)}` : "soon",
  });
}

export async function extensionDraft(scope: UserScope, tz: string, assignmentId: string, opts: { asked: string; done?: string | null; name: string }) {
  const work = await getAssignment(scope, assignmentId);
  const course = await getCourse(scope, work.course.id);
  const email = extensionEmail({
    professor: course.instructorName ?? "",
    course: course.code ?? course.name,
    title: work.title,
    dueDay: work.dueAt ? formatDateStr(localDateOf(work.dueAt, tz), "EEEE, MMMM d") : "soon",
    asked: opts.asked,
    done: opts.done,
    name: firstName(opts.name) || opts.name,
  });
  return { ...email, to: course.instructorEmail ?? null };
}

export async function billMoveDraft(scope: UserScope, billId: string, opts: { payday?: string | null; name: string }) {
  const bill = await getRecurring(scope, billId);
  if (bill.kind === "income") throw new Error("That isn't a bill.");
  return billMoveText({
    biller: bill.name,
    dueDay: bill.nextDueDate ? formatDateStr(bill.nextDueDate, "EEEE, MMMM d") : "soon",
    payday: opts.payday,
    name: firstName(opts.name) || opts.name,
  });
}
