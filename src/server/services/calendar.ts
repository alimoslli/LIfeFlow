import { and, asc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, daysBetween, dayOfWeek, localDateOf, localTimeOf, localToInstant, startOfLocalDay, weekStart } from "@/lib/dates";
import { calendarEvents, courses, type EventKind, type Recurrence, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound, ServiceError } from "./errors";
import { listAssignments } from "./school";
import { listTasks } from "./tasks";
import { listShifts } from "./work";

export const EVENT_KINDS = ["personal", "class", "exam", "work", "study", "appointment", "reminder", "other"] as const;

const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly"]),
  byDay: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: z.string().regex(DATE_RE).optional(),
  interval: z.number().int().min(1).max(12).optional(),
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

export async function updateEvent(scope: UserScope, tz: string, id: string, input: EventInput) {
  const d = eventInputSchema.parse(input);
  await assertOwned(scope, courses, d.courseId, "Course");
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
  return row;
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
  return rows.flatMap(({ event, courseColor, courseName }) => expandOccurrences(event, from, to, tz).map((o) => ({ ...event, ...o, courseColor, courseName })));
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
        subtitle: [e.courseName, e.location].filter(Boolean).join(" · ") || null,
        href: `/calendar?date=${localDateOf(e.startsAt, tz)}`,
        blocksTime: !e.allDay,
      });
    }
  }
  if (include.has("shift")) {
    for (const s of await listShifts(scope, tz, from, to)) {
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

/** Free gaps (minutes >= minMinutes) on a local day between dayStart and dayEnd (HH:mm). */
export function freeSlots(items: AgendaItem[], date: string, tz: string, dayStart = "08:00", dayEnd = "22:00", minMinutes = 30) {
  const start = localToInstant(date, dayStart, tz).getTime();
  const end = localToInstant(date, dayEnd, tz).getTime();
  const busy = items
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
