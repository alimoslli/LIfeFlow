import { and, asc, eq, gt, gte, isNotNull, isNull, inArray, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, daysBetween, dayOfWeek, localDateOf, localTimeOf, localToInstant, startOfLocalDay, weekStart } from "@/lib/dates";
import { calendarEvents, courses, type EventKind, type Recurrence, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound, ServiceError } from "./errors";
import { getAssignment, listAssignments, updateAssignment } from "./school";
import { getTask, listTasks, updateTask } from "./tasks";
import { listShifts } from "./work";
import { mergeCrossSource, sourceLabel } from "./calendar-merge";
import { isDueEvent } from "@/lib/next-up";

export const EVENT_KINDS = ["personal", "class", "exam", "work", "study", "appointment", "reminder", "other"] as const;

const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly"]),
  byDay: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: z.string().regex(DATE_RE).optional(),
  interval: z.number().int().min(1).max(12).optional(),
  skip: z.array(z.string().regex(DATE_RE)).max(1000).optional(),
});

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    date: z.string().regex(DATE_RE),
    startTime: z.string().regex(TIME_RE).nullish(),
    endTime: z.string().regex(TIME_RE).nullish(),
    endDate: z.string().regex(DATE_RE).nullish(),
    allDay: z.boolean().default(false),
    kind: z.enum(EVENT_KINDS).default("personal"),
    location: z.string().max(300).nullish(),
    description: z.string().max(5000).nullish(),
    recurrence: recurrenceSchema.nullish(),
    courseId: z.string().uuid().nullish(),
  })
  .refine((e) => e.allDay || e.startTime, { message: "Timed events need a start time", path: ["startTime"] });
export type EventInput = z.input<typeof eventInputSchema>;

function eventInstants(d: z.infer<typeof eventInputSchema>, tz: string) {
  if (d.allDay) {
    const end = d.endDate ?? d.date;
    return { startsAt: startOfLocalDay(d.date, tz), endsAt: startOfLocalDay(addDaysStr(end, 1), tz) };
  }
  const startsAt = localToInstant(d.date, d.startTime!, tz);
  let endsAt: Date;
  if (d.endTime) {
    const endDate = d.endDate ?? (d.endTime <= d.startTime! ? addDaysStr(d.date, 1) : d.date);
    endsAt = localToInstant(endDate, d.endTime, tz);
  } else endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  if (endsAt <= startsAt) throw new ServiceError("An event must end after it starts.");
  return { startsAt, endsAt };
}

export async function createEvent(scope: UserScope, tz: string, input: EventInput, source: DataSource = "manual") {
  const d = eventInputSchema.parse(input);
  await assertOwned(scope, courses, d.courseId, "Course");
  const [row] = await scope.tx
    .insert(calendarEvents)
    .values({
      userId: scope.userId,
      title: d.title,
      kind: d.kind,
      allDay: d.allDay,
      location: d.location ?? null,
      description: d.description ?? null,
      recurrence: d.recurrence ?? null,
      courseId: d.courseId ?? null,
      source,
      ...eventInstants(d, tz),
    })
    .returning();
  return row;
}

/**
 * The other rows the lists show as the same event (e.g. its Outlook copy when you act on the Google one).
 * Dragging, editing the time and deleting act on all of them, so nothing is left behind showing twice.
 */
export async function eventTwins(scope: UserScope, id: string): Promise<(typeof calendarEvents.$inferSelect)[]> {
  const [ev] = await scope.tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)));
  if (!ev || ev.recurrence) return [];
  const day = 24 * 3_600_000;
  const near = await scope.tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, scope.userId),
        isNull(calendarEvents.recurrence),
        gte(calendarEvents.startsAt, new Date(ev.startsAt.getTime() - day)),
        lte(calendarEvents.startsAt, new Date(ev.startsAt.getTime() + day)),
      ),
    );
  const group = mergeCrossSource(near).find((m) => m.mergedIds.includes(id));
  return near.filter((r) => r.id !== id && group?.mergedIds.includes(r.id));
}

export async function updateEvent(scope: UserScope, tz: string, id: string, input: EventInput) {
  const d = eventInputSchema.parse(input);
  await assertOwned(scope, courses, d.courseId, "Course");
  const twins = d.recurrence ? [] : await eventTwins(scope, id);
  const [row] = await scope.tx
    .update(calendarEvents)
    .set({
      title: d.title,
      kind: d.kind,
      allDay: d.allDay,
      location: d.location ?? null,
      description: d.description ?? null,
      recurrence: d.recurrence ?? null,
      courseId: d.courseId ?? null,
      ...eventInstants(d, tz),
    })
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Event");
  // Copies shown as this same event follow its new time, so they stay one event.
  if (twins.length)
    await scope.tx
      .update(calendarEvents)
      .set({ startsAt: row.startsAt, endsAt: row.endsAt, allDay: row.allDay })
      .where(
        and(
          eq(calendarEvents.userId, scope.userId),
          inArray(
            calendarEvents.id,
            twins.map((t) => t.id),
          ),
        ),
      );
  return row;
}

/** Calendar drag and drop: moves an event, to-do or assignment to another day, keeping its time. Shifts and repeating events stay put. */
/** Removes one occurrence of a repeating event, keeping the rest of the series. */
export async function skipOccurrence(scope: UserScope, id: string, date: string) {
  const [ev] = await scope.tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)));
  if (!ev) throw notFound("Event");
  if (!ev.recurrence) throw new ServiceError("This event doesn't repeat. Delete it instead.");
  if (!DATE_RE.test(date)) throw new ServiceError("Pick a valid day.");
  const skip = [...new Set([...(ev.recurrence.skip ?? []), date])];
  await scope.tx
    .update(calendarEvents)
    .set({ recurrence: { ...ev.recurrence, skip } })
    .where(eq(calendarEvents.id, id));
  return { skipped: date };
}

/** Changes one occurrence: that day is skipped in the series and the change becomes its own event. */
export async function editOccurrence(scope: UserScope, tz: string, id: string, date: string, input: EventInput) {
  await skipOccurrence(scope, id, date);
  return createEvent(scope, tz, { ...input, recurrence: null });
}

export async function moveAgendaItem(scope: UserScope, tz: string, origin: "event" | "task" | "assignment", id: string, date: string) {
  if (!DATE_RE.test(date)) throw new ServiceError("Pick a day.");
  const time = (at: Date | null, allDay: boolean) => (at && !allDay ? localTimeOf(at, tz) : null);
  if (origin === "task") {
    const t = await getTask(scope, id);
    return updateTask(scope, tz, id, { dueDate: date, dueTime: time(t.dueAt, t.dueAllDay) });
  }
  if (origin === "assignment") {
    const a = await getAssignment(scope, id);
    return updateAssignment(scope, tz, id, { dueDate: date, dueTime: time(a.dueAt, a.dueAllDay) });
  }
  const [ev] = await scope.tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)));
  if (!ev) throw notFound("Event");
  if (ev.recurrence) throw new ServiceError("Repeating events can't be dragged. Open the event to change it.");
  // Same local time on the new day (DST-safe); multi-day events keep their length. Copies shown as the same event move with it.
  const twins = await eventTwins(scope, id);
  let moved = ev;
  for (const e of [ev, ...twins]) {
    const from = localDateOf(e.startsAt, tz);
    const shift = startOfLocalDay(date, tz).getTime() - startOfLocalDay(from, tz).getTime();
    const startsAt = e.allDay ? new Date(e.startsAt.getTime() + shift) : localToInstant(date, localTimeOf(e.startsAt, tz), tz);
    const endsAt = new Date(e.endsAt.getTime() + (startsAt.getTime() - e.startsAt.getTime()));
    const [row] = await scope.tx.update(calendarEvents).set({ startsAt, endsAt }).where(eq(calendarEvents.id, e.id)).returning();
    if (e.id === id) moved = row;
  }
  return moved;
}

export async function deleteEvent(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)))
    .returning({ id: calendarEvents.id, title: calendarEvents.title });
  if (!row) throw notFound("Event");
  return row;
}

export async function getEvent(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)));
  if (!row) throw notFound("Event");
  return row;
}

/**
 * Ticks a one-off hand-in on the calendar done, or opens it again (owner, 2026-11-18: a test student delivering client
 * photos had no way to mark "Deliver: Rivera and Chen sneak peeks" done). Only a single event that reads as a hand-in
 * (`isDueEvent`): a class or a repeating event is never "done".
 */
export async function toggleHandIn(scope: UserScope, id: string) {
  const e = await getEvent(scope, id);
  if (e.recurrence || !isDueEvent(e.title)) throw new ServiceError("Only a one-off hand-in can be ticked done.", "invalid");
  const doneAt = e.doneAt ? null : new Date();
  await scope.tx
    .update(calendarEvents)
    .set({ doneAt })
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, scope.userId)));
  return { title: e.title, done: !!doneAt };
}

// ---------------------------------------------------------------- recurrence (pure)

type EventLike = { startsAt: Date; endsAt: Date; allDay: boolean; recurrence: Recurrence | null };

/** Expands an event into concrete [start, end) occurrences intersecting the local date range [from, to]. */
export function expandOccurrences(e: EventLike, from: string, to: string, tz: string): { startsAt: Date; endsAt: Date }[] {
  const rangeStart = startOfLocalDay(from, tz);
  const rangeEnd = startOfLocalDay(addDaysStr(to, 1), tz);
  if (!e.recurrence) return e.startsAt < rangeEnd && e.endsAt > rangeStart ? [{ startsAt: e.startsAt, endsAt: e.endsAt }] : [];
  const r = e.recurrence;
  const baseDate = localDateOf(e.startsAt, tz);
  const baseTime = localTimeOf(e.startsAt, tz);
  const duration = e.endsAt.getTime() - e.startsAt.getTime();
  const interval = r.interval ?? 1;
  const days = r.freq === "weekly" ? (r.byDay?.length ? r.byDay : [dayOfWeek(baseDate)]) : null;
  const out: { startsAt: Date; endsAt: Date }[] = [];
  // Start one day early so an overnight occurrence that began yesterday is included.
  let d = addDaysStr(from, -1) < baseDate ? baseDate : addDaysStr(from, -1);
  const last = r.until && r.until < to ? r.until : to;
  for (let guard = 0; d <= last && guard < 800; d = addDaysStr(d, 1), guard++) {
    if (r.freq === "daily" && daysBetween(baseDate, d) % interval !== 0) continue;
    if (days) {
      if (!days.includes(dayOfWeek(d))) continue;
      if (Math.floor(daysBetween(weekStart(baseDate, 0), weekStart(d, 0)) / 7) % interval !== 0) continue;
    }
    const startsAt = e.allDay ? startOfLocalDay(d, tz) : localToInstant(d, baseTime, tz);
    const endsAt = new Date(startsAt.getTime() + duration);
    if (r.skip?.includes(d)) continue;
    if (startsAt < rangeEnd && endsAt > rangeStart) out.push({ startsAt, endsAt });
  }
  return out;
}

// ---------------------------------------------------------------- unified agenda

export type AgendaItem = {
  key: string;
  origin: "event" | "shift" | "assignment" | "task";
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  kind: EventKind | "deadline" | "task";
  color: string | null;
  subtitle: string | null;
  href: string;
  /** Point-in-time items (deadlines) don't block time and are never "conflicts". */
  blocksTime: boolean;
  /** A day of a repeating event (its date can be removed on its own). */
  repeats?: boolean;
  /** Where this event lives, when more than one place has it (e.g. "Google + Outlook"). */
  sources?: string[];
  /** Where it happens (an event's location: a room, an address), said in Today's note (owner, 2026-11-18). */
  location?: string | null;
  /** A one-off hand-in the person ticked done (calendar_events.done_at). */
  done?: boolean;
};

export async function listEventsInRange(scope: UserScope, tz: string, from: string, to: string) {
  const rangeStart = startOfLocalDay(from, tz);
  const rangeEnd = startOfLocalDay(addDaysStr(to, 1), tz);
  const rows = await scope.tx
    .select({ event: calendarEvents, courseColor: courses.color, courseName: courses.name })
    .from(calendarEvents)
    .leftJoin(courses, eq(courses.id, calendarEvents.courseId))
    .where(
      and(
        eq(calendarEvents.userId, scope.userId),
        lt(calendarEvents.startsAt, rangeEnd),
        or(and(isNull(calendarEvents.recurrence), gt(calendarEvents.endsAt, rangeStart)), isNotNull(calendarEvents.recurrence)),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt));
  const occurrences = rows.flatMap(({ event, courseColor, courseName }) =>
    expandOccurrences(event, from, to, tz).map((o) => ({ ...event, ...o, courseColor, courseName })),
  );
  // The same event on Google and Outlook (or Canvas, or LifeFlow) is one event, read time only; no provider row is touched.
  return mergeCrossSource(occurrences).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

const KIND_COLORS: Record<string, string> = {
  class: "#2563eb",
  exam: "#dc2626",
  work: "#0f766e",
  study: "#7c3aed",
  appointment: "#d97706",
  personal: "#475569",
  reminder: "#64748b",
  other: "#64748b",
};

function sourcesNote(sources: string[]) {
  const labels = [...new Set(sources.map(sourceLabel))];
  return labels.length > 1 ? `On ${labels.join(" + ")}` : null;
}

export async function getAgenda(
  scope: UserScope,
  tz: string,
  from: string,
  to: string,
  opts: { include?: AgendaItem["origin"][]; now?: Date } = {},
): Promise<AgendaItem[]> {
  const include = new Set(opts.include ?? ["event", "shift", "assignment", "task"]);
  const items: AgendaItem[] = [];
  if (include.has("event")) {
    for (const e of await listEventsInRange(scope, tz, from, to)) {
      items.push({
        key: `event:${e.id}:${e.startsAt.toISOString()}`,
        origin: "event",
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        allDay: e.allDay,
        kind: e.kind,
        color: e.courseColor ?? KIND_COLORS[e.kind],
        subtitle: [e.courseName, e.location, sourcesNote(e.sources)].filter(Boolean).join(" · ") || null,
        href: `/calendar?date=${localDateOf(e.startsAt, tz)}`,
        blocksTime: !e.allDay,
        repeats: !!e.recurrence,
        sources: e.sources,
        location: e.location,
        ...(e.doneAt && { done: true }),
      });
    }
  }
  if (include.has("shift")) {
    // a shift that started the evening before and runs past midnight is part of this day too (an overnight shift ending
    // at 6:30 AM): without it the morning looked free, and the skyling offered "Fri 9 AM" to someone asleep after it
    const dayStart = startOfLocalDay(from, tz);
    const shifts = (await listShifts(scope, tz, addDaysStr(from, -1), to)).filter((s) => s.startsAt >= dayStart || (s.endsAt && s.endsAt > dayStart));
    for (const s of shifts) {
      items.push({
        key: `shift:${s.id}`,
        origin: "shift",
        id: s.id,
        title: `Work · ${s.employer.name}`,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        allDay: false,
        kind: "work",
        color: s.employer.color ?? KIND_COLORS.work,
        subtitle: s.breakMinutes ? `${s.breakMinutes} min break` : null,
        href: "/work",
        blocksTime: true,
      });
    }
  }
  const rangeStart = startOfLocalDay(from, tz);
  const rangeEnd = startOfLocalDay(addDaysStr(to, 1), tz);
  if (include.has("assignment")) {
    const list = await listAssignments(scope, tz, { view: "all", now: opts.now });
    for (const a of list) {
      if (!a.dueAt || a.dueAt < rangeStart || a.dueAt >= rangeEnd || a.status === "done") continue;
      items.push({
        key: `assignment:${a.id}`,
        origin: "assignment",
        id: a.id,
        title: a.title,
        startsAt: a.dueAt,
        endsAt: null,
        allDay: a.dueAllDay,
        kind: a.kind === "exam" ? "exam" : "deadline",
        color: a.course.color,
        subtitle: a.course.code ?? a.course.name,
        href: `/school/courses/${a.course.id}`,
        blocksTime: false,
        ...(a.source === "email" ? { sources: ["email"] } : {}),
      });
    }
  }
  if (include.has("task")) {
    const list = await listTasks(scope, { status: "open", dueBefore: rangeEnd });
    for (const t of list) {
      if (!t.dueAt || t.dueAt < rangeStart) continue;
      items.push({
        key: `task:${t.id}`,
        origin: "task",
        id: t.id,
        title: t.title,
        startsAt: t.dueAt,
        endsAt: null,
        allDay: t.dueAllDay,
        kind: "task",
        color: t.priority === "urgent" || t.priority === "high" ? "#dc2626" : "#475569",
        subtitle: `${t.priority} priority`,
        href: "/tasks",
        blocksTime: false,
      });
    }
  }
  return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || Number(b.allDay) - Number(a.allDay));
}

/** Pairs of time-blocking items that overlap. */
/** Courses whose class meetings are on the calendar (events of kind "class" linked to the course). */
export async function coursesOnCalendar(scope: UserScope) {
  const rows = await scope.tx
    .selectDistinct({ id: calendarEvents.courseId })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, scope.userId), eq(calendarEvents.kind, "class"), isNotNull(calendarEvents.courseId)));
  return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
}

export function findConflicts(items: AgendaItem[]) {
  const timed = items.filter((i) => i.blocksTime && i.endsAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const conflicts: { a: AgendaItem; b: AgendaItem }[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].startsAt < timed[i].endsAt!; j++) {
      conflicts.push({ a: timed[i], b: timed[j] });
    }
  }
  return conflicts;
}

/**
 * Sleep after an overnight shift is not free time (COO, 2026-11-16, from the test user: "Block Fri 9 AM" was offered to
 * a student asleep after a shift ending at 6:30 AM). A shift that crosses midnight, or starts between 10 PM and 4 AM, is followed by
 * `SLEEP_AFTER_NIGHT_SHIFT_HOURS` of rest. A fixed gap until a learned sleep model exists (none is stored today).
 */
export const SLEEP_AFTER_NIGHT_SHIFT_HOURS = 8;
function restAfterNightShifts<T extends Pick<AgendaItem, "blocksTime" | "startsAt" | "endsAt"> & { origin?: AgendaItem["origin"] }>(items: T[], tz: string) {
  const rest: Pick<AgendaItem, "blocksTime" | "startsAt" | "endsAt">[] = [];
  for (const i of items) {
    if (i.origin !== "shift" || !i.endsAt) continue;
    // a night shift crosses local midnight or starts in the night (10 PM to 4 AM); an opener from 5 AM is awake after it
    const starts = localTimeOf(i.startsAt, tz);
    const overnight = localDateOf(i.startsAt, tz) !== localDateOf(i.endsAt, tz) || starts >= "22:00" || starts < "04:00";
    if (overnight) rest.push({ blocksTime: true, startsAt: i.endsAt, endsAt: new Date(i.endsAt.getTime() + SLEEP_AFTER_NIGHT_SHIFT_HOURS * 3_600_000) });
  }
  return rest;
}

/** Open blocks on a day between busy items (minutes >= minMinutes, between dayStart and dayEnd, HH:mm). With `notBefore`
 * (now), nothing earlier is offered; it starts on the next quarter hour. The rest after an overnight shift counts as busy. */
export function freeSlots(
  items: (Pick<AgendaItem, "blocksTime" | "startsAt" | "endsAt"> & { origin?: AgendaItem["origin"] })[],
  date: string,
  tz: string,
  dayStart = "08:00",
  dayEnd = "22:00",
  minMinutes = 30,
  notBefore?: Date,
) {
  const quarter = 15 * 60_000;
  const start = Math.max(localToInstant(date, dayStart, tz).getTime(), notBefore ? Math.ceil(notBefore.getTime() / quarter) * quarter : 0);
  const end = localToInstant(date, dayEnd, tz).getTime();
  const busy = [...items, ...restAfterNightShifts(items, tz)]
    .filter((i) => i.blocksTime && i.endsAt)
    .map((i) => [Math.max(start, i.startsAt.getTime()), Math.min(end, i.endsAt!.getTime())] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const slots: { startsAt: Date; endsAt: Date; minutes: number }[] = [];
  let cursor = start;
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes * 60_000) slots.push({ startsAt: new Date(cursor), endsAt: new Date(s), minutes: (s - cursor) / 60_000 });
    cursor = Math.max(cursor, e);
  }
  if (end - cursor >= minMinutes * 60_000) slots.push({ startsAt: new Date(cursor), endsAt: new Date(end), minutes: (end - cursor) / 60_000 });
  return slots;
}
