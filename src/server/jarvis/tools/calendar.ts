import { z } from "zod";
import { moveToTrash } from "../../services/trash";
import { addDaysStr, daysBetween, formatIn, localDateOf } from "@/lib/dates";
import { EVENT_KINDS, createEvent, findConflicts, freeSlots, getAgenda, getEvent, updateEvent, type AgendaItem } from "../../services/calendar";
import { dateArg, defineTool, idArg, timeArg, type ToolContext } from "../tool";

export function presentAgendaItem(i: AgendaItem, ctx: ToolContext) {
  const fmt = (d: Date) => formatIn(d, ctx.tz, "yyyy-MM-dd HH:mm");
  return {
    type: i.origin,
    id: i.id,
    title: i.title,
    kind: i.kind,
    start: i.allDay ? localDateOf(i.startsAt, ctx.tz) : fmt(i.startsAt),
    end: i.endsAt && !i.allDay ? fmt(i.endsAt) : undefined,
    allDay: i.allDay || undefined,
    detail: i.subtitle ?? undefined,
    blocksTime: i.blocksTime,
  };
}

const recurrence = z
  .object({
    freq: z.enum(["daily", "weekly"]),
    byDay: z.array(z.number().int().min(0).max(6)).optional().describe("Weekdays, 0=Sunday … 6=Saturday"),
    until: dateArg("Last date (inclusive)").optional(),
    interval: z.number().int().min(1).max(12).optional(),
  })
  .describe("Repeat rule");

const eventArgs = z.object({
  title: z.string().min(1).max(300),
  date: dateArg("Start date"),
  startTime: timeArg().optional(),
  endTime: timeArg().optional(),
  allDay: z.boolean().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  location: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  recurrence: recurrence.optional(),
  courseId: idArg("Course").optional(),
});

export const calendarTools = [
  defineTool({
    name: "get_agenda",
    description:
      "The user's unified schedule for a date range: calendar events (incl. classes & recurring), work shifts, assignment deadlines and task due dates. Also returns time conflicts. Max 62 days.",
    schema: z.object({ from: dateArg(), to: dateArg() }),
    mutates: false,
    async execute({ from, to }, ctx) {
      if (to < from || daysBetween(from, to) > 62) throw new Error("Range must be 0–62 days and to >= from.");
      const items = await ctx.run((s) => getAgenda(s, ctx.tz, from, to, { now: ctx.now }));
      const conflicts = findConflicts(items).map((c) => ({ a: c.a.title, b: c.b.title, at: formatIn(c.b.startsAt, ctx.tz, "yyyy-MM-dd HH:mm") }));
      return { from, to, items: items.map((i) => presentAgendaItem(i, ctx)), conflicts };
    },
  }),
  defineTool({
    name: "find_free_time",
    description: "Find open time blocks between existing commitments (events and shifts) for each day in a range. Use before scheduling study sessions.",
    schema: z.object({
      from: dateArg(),
      to: dateArg(),
      minMinutes: z.number().int().min(15).max(480).optional(),
      dayStart: timeArg("Earliest time to consider (default 08:00)").optional(),
      dayEnd: timeArg("Latest time to consider (default 22:00)").optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      if (a.to < a.from || daysBetween(a.from, a.to) > 14) throw new Error("Range must be 0–14 days.");
      const items = await ctx.run((s) => getAgenda(s, ctx.tz, a.from, a.to, { include: ["event", "shift"], now: ctx.now }));
      const days = [];
      for (let d = a.from; d <= a.to; d = addDaysStr(d, 1)) {
        const slots = freeSlots(items, d, ctx.tz, a.dayStart ?? "08:00", a.dayEnd ?? "22:00", a.minMinutes ?? 45);
        days.push({
          date: d,
          weekday: formatIn(new Date(`${d}T12:00:00Z`), "UTC", "EEEE"),
          free: slots.map((s) => ({ start: formatIn(s.startsAt, ctx.tz, "HH:mm"), end: formatIn(s.endsAt, ctx.tz, "HH:mm"), minutes: s.minutes })),
        });
      }
      return { days };
    },
  }),
  defineTool({
    name: "create_events",
    description:
      "Add calendar events (classes, study sessions, appointments, exams...). Supports weekly/daily recurrence. Returns any conflicts with existing commitments — never silently double-book; mention conflicts to the user.",
    schema: z.object({ events: z.array(eventArgs).min(1).max(40) }),
    mutates: true,
    async execute({ events }, ctx) {
      return ctx.run(async (s) => {
        const created = [];
        const conflicts: { event: string; conflictsWith: string; at: string }[] = [];
        for (const e of events) {
          const before = await getAgenda(s, ctx.tz, e.date, e.date, { include: ["event", "shift"] });
          const row = await createEvent(s, ctx.tz, { ...e, allDay: e.allDay ?? !e.startTime }, "jarvis");
          const item: AgendaItem = {
            key: "new",
            origin: "event",
            id: row.id,
            title: row.title,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            allDay: row.allDay,
            kind: row.kind,
            color: null,
            subtitle: null,
            href: "",
            blocksTime: !row.allDay,
          };
          for (const c of findConflicts([...before, item])) {
            if (c.a.id === row.id || c.b.id === row.id) {
              const other = c.a.id === row.id ? c.b : c.a;
              conflicts.push({ event: row.title, conflictsWith: other.title, at: formatIn(other.startsAt, ctx.tz, "yyyy-MM-dd HH:mm") });
            }
          }
          created.push({
            id: row.id,
            title: row.title,
            start: formatIn(row.startsAt, ctx.tz, "yyyy-MM-dd HH:mm"),
            end: formatIn(row.endsAt, ctx.tz, "yyyy-MM-dd HH:mm"),
            recurring: !!row.recurrence,
          });
        }
        return { created, conflicts, viewAt: `/calendar?date=${events[0].date}` };
      });
    },
  }),
  defineTool({
    name: "update_event",
    description: "Replace an event's details. Provide the full set of fields (fetch with get_agenda first).",
    schema: eventArgs.extend({ id: idArg("Event") }),
    mutates: true,
    async execute({ id, ...e }, ctx) {
      const row = await ctx.run((s) => updateEvent(s, ctx.tz, id, { ...e, allDay: e.allDay ?? !e.startTime }));
      return { updated: { id: row.id, title: row.title, start: formatIn(row.startsAt, ctx.tz, "yyyy-MM-dd HH:mm") } };
    },
  }),
  defineTool({
    name: "delete_event",
    description: "Delete a calendar event (all occurrences if recurring). Requires the user's confirmation.",
    schema: z.object({ id: idArg("Event") }),
    mutates: true,
    async confirm({ id }, ctx) {
      const e = await ctx.run((s) => getEvent(s, id));
      return `Delete event "${e.title}" on ${formatIn(e.startsAt, ctx.tz, "EEE MMM d, h:mm a")}${e.recurrence ? " (all occurrences)" : ""}?`;
    },
    async execute({ id }, ctx) {
      const t = await ctx.run((s) => moveToTrash(s, "event", id));
      return { deleted: t.label, restorableFromTrash: true };
    },
  }),
];
