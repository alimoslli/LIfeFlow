import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { addDaysStr, DATE_RE, formatIn, localDateOf, localTimeOf } from "@/lib/dates";
import { financialGoals, tripItems, trips } from "../db/schema";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { createEvent, deleteEvent } from "./calendar";
import { assertOwned, ServiceError } from "./errors";
import { listAssignments } from "./school";
import { listShifts } from "./work";

/**
 * Trips: dates, places and bookings. Each booking also goes on the calendar,
 * so it shows in Plan and Today, and the trip page flags clashes with shifts,
 * classes and deadlines. Costs roll up against the trip's budget.
 */

export const tripInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the trip.").max(120),
    destination: z.string().trim().max(120).nullish(),
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    budgetCents: z.number().int().min(0).max(100_000_000).nullish(),
    goalId: z.string().uuid().nullish(),
    notes: z.string().max(5000).nullish(),
  })
  .refine((t) => t.endDate >= t.startDate, { message: "The trip ends before it starts.", path: ["endDate"] });

export const tripItemInputSchema = z.object({
  tripId: z.string().uuid(),
  kind: z.enum(["flight", "train", "hotel", "car", "activity", "other"]),
  title: z.string().trim().min(1).max(200),
  /** Local date and time, YYYY-MM-DDTHH:mm. */
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
    .nullish(),
  location: z.string().trim().max(200).nullish(),
  confirmation: z.string().trim().max(60).nullish(),
  costCents: z.number().int().min(0).max(100_000_000).nullish(),
});

export async function createTrip(scope: UserScope, input: z.input<typeof tripInputSchema>, source: "manual" | "inbox" = "manual") {
  const d = tripInputSchema.parse(input);
  await assertOwned(scope, financialGoals, d.goalId, "Goal");
  const [row] = await scope.tx
    .insert(trips)
    .values({
      userId: scope.userId,
      ...d,
      destination: d.destination ?? null,
      budgetCents: d.budgetCents ?? null,
      goalId: d.goalId ?? null,
      notes: d.notes ?? null,
      source,
    })
    .returning();
  return row;
}

export async function updateTrip(scope: UserScope, id: string, input: z.input<typeof tripInputSchema>) {
  const d = tripInputSchema.parse(input);
  const [row] = await scope.tx
    .update(trips)
    .set(d)
    .where(and(eq(trips.id, id), eq(trips.userId, scope.userId)))
    .returning();
  if (!row) throw new ServiceError("Trip not found", "not_found");
  return row;
}

export async function deleteTrip(scope: UserScope, id: string) {
  const items = await scope.tx
    .select()
    .from(tripItems)
    .where(and(eq(tripItems.tripId, id), eq(tripItems.userId, scope.userId)));
  for (const i of items) if (i.eventId) await deleteEvent(scope, i.eventId).catch(() => undefined);
  await scope.tx.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, scope.userId)));
}

export async function listTrips(scope: UserScope) {
  return scope.tx.select().from(trips).where(eq(trips.userId, scope.userId)).orderBy(desc(trips.startDate));
}

const split = (s: string) => ({ date: s.slice(0, 10), time: s.length > 10 ? s.slice(11, 16) : null });

/** Adds a booking or plan item and puts it on the calendar. Extends the trip's dates if needed. */
export async function addTripItem(scope: UserScope, tz: string, input: z.input<typeof tripItemInputSchema>, source: "manual" | "inbox" = "manual") {
  const d = tripItemInputSchema.parse(input);
  const [trip] = await scope.tx
    .select()
    .from(trips)
    .where(and(eq(trips.id, d.tripId), eq(trips.userId, scope.userId)));
  if (!trip) throw new ServiceError("Trip not found", "not_found");
  const start = split(d.start);
  const end = d.end ? split(d.end) : null;
  const ev = await createEvent(scope, tz, {
    title: `${{ flight: "Flight", train: "Train", hotel: "Hotel", car: "Car", activity: "", other: "" }[d.kind]} ${d.title}`.trim(),
    date: start.date,
    startTime: start.time,
    endTime: end && end.date === start.date ? end.time : null,
    endDate: end && end.date !== start.date ? end.date : null,
    allDay: !start.time,
    kind: "personal",
    location: d.location ?? null,
    description: d.confirmation ? `Confirmation ${d.confirmation}` : null,
  });
  const [row] = await scope.tx
    .insert(tripItems)
    .values({
      userId: scope.userId,
      tripId: trip.id,
      kind: d.kind,
      title: d.title,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt ?? null,
      location: d.location ?? null,
      confirmation: d.confirmation ?? null,
      costCents: d.costCents ?? null,
      eventId: ev.id,
      source,
    })
    .returning();
  const last = end?.date ?? start.date;
  if (start.date < trip.startDate || last > trip.endDate)
    await scope.tx
      .update(trips)
      .set({ startDate: start.date < trip.startDate ? start.date : trip.startDate, endDate: last > trip.endDate ? last : trip.endDate })
      .where(eq(trips.id, trip.id));
  return row;
}

export async function deleteTripItem(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(tripItems)
    .where(and(eq(tripItems.id, id), eq(tripItems.userId, scope.userId)))
    .returning();
  if (row?.eventId) await deleteEvent(scope, row.eventId).catch(() => undefined);
  return row ?? null;
}

/** A trip that covers these dates (or matches the destination), for filing bookings. */
export async function findTrip(scope: UserScope, from: string, to: string, destination?: string | null) {
  const rows = await scope.tx
    .select()
    .from(trips)
    .where(and(eq(trips.userId, scope.userId), lte(trips.startDate, addDaysStr(to, 2)), gte(trips.endDate, addDaysStr(from, -2))));
  const dest = destination?.toLowerCase();
  return rows.find((t) => dest && (t.destination?.toLowerCase().includes(dest) || t.name.toLowerCase().includes(dest))) ?? rows[0] ?? null;
}

/** Everything on the trip page: bookings by day, costs vs. budget, and clashes with the rest of life. */
export async function tripDetail(scope: UserScope, tz: string, id: string) {
  const [trip] = await scope.tx
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.userId, scope.userId)));
  if (!trip) return null;
  const [items, shifts, due, goal] = await series(
    () => scope.tx.select().from(tripItems).where(eq(tripItems.tripId, id)).orderBy(asc(tripItems.startsAt)),
    () => listShifts(scope, tz, trip.startDate, trip.endDate),
    () => listAssignments(scope, tz, { view: "upcoming", limit: 100 }),
    () =>
      trip.goalId
        ? scope.tx
            .select()
            .from(financialGoals)
            .where(eq(financialGoals.id, trip.goalId))
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
  );
  const clashes = [
    ...shifts
      .filter((s) => s.status !== "cancelled")
      .map((s) => `Shift at ${s.employer.name} on ${formatIn(s.startsAt, tz, "EEE, MMM d")} at ${localTimeOf(s.startsAt, tz)}`),
    ...due
      .filter((a) => a.dueAt && localDateOf(a.dueAt, tz) >= trip.startDate && localDateOf(a.dueAt, tz) <= trip.endDate)
      .map((a) => `${a.title} (${a.course.name}) due ${formatIn(a.dueAt!, tz, "EEE, MMM d")}`),
  ];
  const costCents = items.reduce((s, i) => s + (i.costCents ?? 0), 0);
  const days = new Map<string, typeof items>();
  for (const i of items) {
    const day = localDateOf(i.startsAt, tz);
    days.set(day, [...(days.get(day) ?? []), i]);
  }
  return { trip, items, days: [...days.entries()], clashes, costCents, goal };
}
