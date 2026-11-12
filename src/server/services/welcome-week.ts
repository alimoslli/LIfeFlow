import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { addDaysStr, formatDateStr, localDateOf, localTimeOf, todayIn } from "@/lib/dates";
import { jarvisMessages, type UserPreferences } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { createEvent, freeSlots, getAgenda } from "./calendar";
import { ServiceError } from "./errors";
import { createRecurring } from "./finance/planning";
import { listAssignments } from "./school";
import { createTask } from "./tasks";
import { createEmployer, createShift, listEmployers } from "./work";
import { clockTime, DETECTORS, type Candidate } from "./proactive/detectors";
import { saveMessage, toneOf } from "./proactive/engine";

/**
 * The welcome's "Here's your week so far" (proposal (a), owner 2026-11-12). Two things, both from the person's own rows:
 *
 * 1. `firstFix`: at most one suggestion for the week that really landed, saved as an ordinary skyling message
 *    (`jarvis_messages`) so "Yes" and "Undo" are the existing suggestion path (`respondToMessage`). A deadline that clashes
 *    with a long shift comes from the existing detector; otherwise the nearest due date with nothing set aside for it gets
 *    a two-hour study block in free time. Nothing is made up: no due date, no fix.
 * 2. `saveFirstThing`: with nothing connected, one real class, shift, bill or to-do saved through the same services as
 *    the forms, so it shows on the wheel.
 */

const WINDOW_DAYS = 7;
const BLOCK_MINUTES = 120;

const addMinutes = (hhmm: string, mins: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + mins;
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** What the welcome shows of a fix: the words and, once it was acted on, what happened. */
export type WeekFix = {
  id: string;
  title: string;
  body: string;
  status: "pending" | "done" | "undone";
  /** What "Yes" did, for the line under the card. */
  result: string | null;
};

type Row = typeof jarvisMessages.$inferSelect;
const show = (m: Row): WeekFix => ({
  id: m.id,
  title: m.title,
  body: m.body,
  status: m.status === "done" ? "done" : m.status === "dismissed" && m.result?.undone ? "undone" : "pending",
  result: m.result?.text ?? null,
});

/** A due date inside the week with nothing set aside for it, and two free hours before it. */
async function studyBlock(scope: UserScope, tz: string, today: string, now: Date): Promise<Candidate | null> {
  const due = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 20 })).filter(
    (a) => a.dueAt && localDateOf(a.dueAt, tz) <= addDaysStr(today, WINDOW_DAYS),
  );
  for (const a of due) {
    const dueDate = localDateOf(a.dueAt!, tz);
    if (dueDate <= today) continue;
    const items = await getAgenda(scope, tz, today, dueDate, { now });
    // already planned for: any study block or event that names it
    if (items.some((i) => i.origin === "event" && (i.kind === "study" || i.title.toLowerCase().includes(a.title.toLowerCase())))) continue;
    for (let d = addDaysStr(dueDate, -1); d >= today; d = addDaysStr(d, -1)) {
      const day = items.filter((i) => localDateOf(i.startsAt, tz) === d || (i.endsAt && localDateOf(i.startsAt, tz) <= d && localDateOf(i.endsAt, tz) >= d));
      const slot = freeSlots(day, d, tz, "09:00", "21:00", BLOCK_MINUTES, now).find((x) => x.minutes >= BLOCK_MINUTES);
      if (!slot) continue;
      const start = localTimeOf(slot.startsAt, tz);
      return {
        kind: "study_block",
        topic: "school",
        dedupeKey: `study_block:${a.id}`,
        facts: {
          assignment: a.title,
          dueDay: formatDateStr(dueDate, "EEEE"),
          blockWhen: `2 hours on ${formatDateStr(d, "EEEE")} at ${clockTime(start)}`,
        },
        action: { type: "block_time", label: "Block it", date: d, start, end: addMinutes(start, BLOCK_MINUTES), title: `Work on ${a.title}` },
        priority: 60,
      };
    }
  }
  return null;
}

/**
 * The one first fix for what landed, or null when nothing can be fixed (never a made-up one). Saved once per thing it is
 * about (the message's dedupe key), so coming back to the step shows the same card in the state it was left in.
 */
export async function firstFix(scope: UserScope, tz: string, prefs: UserPreferences | undefined, now = new Date()): Promise<WeekFix | null> {
  const today = todayIn(tz, now);
  const ctx = { scope, tz, today, now };
  const clash = (await DETECTORS.deadlineConflicts(ctx)).find((c) => c.action?.type === "block_time");
  const found = clash ?? (await studyBlock(scope, tz, today, now));
  if (!found) {
    // a fix saved earlier and already answered still shows how it went
    const [prev] = await scope.tx
      .select()
      .from(jarvisMessages)
      .where(and(eq(jarvisMessages.userId, scope.userId), eq(jarvisMessages.slot, "welcome")))
      .limit(1);
    return prev && prev.status === "done" ? show(prev) : null;
  }
  const row = await saveMessage(scope, found, toneOf(prefs), false, "welcome");
  if (row) return show(row);
  const [existing] = await scope.tx
    .select()
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), eq(jarvisMessages.dedupeKey, found.dedupeKey)));
  return existing ? show(existing) : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const name = z.string().trim().min(1, "Give it a name.").max(120);

export const firstThingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("class"),
    name,
    date: z.string().regex(DATE, "Pick the day."),
    startTime: z.string().regex(TIME, "Pick a start time."),
    endTime: z.string().regex(TIME, "Pick an end time."),
    weekly: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("shift"),
    name,
    date: z.string().regex(DATE, "Pick the day."),
    startTime: z.string().regex(TIME, "Pick a start time."),
    endTime: z.string().regex(TIME, "Pick an end time."),
  }),
  z.object({
    kind: z.literal("bill"),
    name,
    /** Dollars as typed, like the bill form. */
    amount: z.string().trim().min(1, "Enter the amount."),
    date: z.string().regex(DATE, "Pick the due day."),
  }),
  z.object({
    kind: z.literal("todo"),
    name,
    date: z.string().regex(DATE).optional().or(z.literal("")),
  }),
]);
export type FirstThing = z.input<typeof firstThingSchema>;

/** Saves the one thing they typed, through the same services as the forms. Returns what it was, in a word, for the card. */
export async function saveFirstThing(scope: UserScope, tz: string, input: FirstThing): Promise<{ what: string; title: string }> {
  const d = firstThingSchema.parse(input);
  switch (d.kind) {
    case "class": {
      await createEvent(scope, tz, {
        title: d.name,
        kind: "class",
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
        recurrence: d.weekly ? { freq: "weekly" } : null,
      });
      return { what: "class", title: d.name };
    }
    case "shift": {
      // a shift belongs to a job: the first one they have, or the one they name here
      const jobs = await listEmployers(scope);
      const job =
        jobs.find((j) => j.name.toLowerCase() === d.name.toLowerCase()) ?? jobs[0] ?? (await createEmployer(scope, { name: d.name, payType: "hourly" }));
      await createShift(scope, tz, { employerId: job.id, date: d.date, startTime: d.startTime, endTime: d.endTime });
      return { what: "shift", title: job.name };
    }
    case "bill": {
      const dollars = Number(d.amount.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(dollars) || dollars <= 0) throw new ServiceError("Enter the amount as a number, like 45.");
      await createRecurring(scope, { name: d.name, amountCents: -Math.round(dollars * 100), frequency: "monthly", nextDueDate: d.date, kind: "bill" });
      return { what: "bill", title: d.name };
    }
    case "todo": {
      await createTask(scope, tz, { title: d.name, dueDate: d.date || undefined });
      return { what: "to-do", title: d.name };
    }
  }
}
