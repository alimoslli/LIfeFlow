import { z } from "zod";
import { formatIn } from "@/lib/dates";
import { addTripItem, createTrip, deleteTripItem, listTrips, tripDetail } from "../../services/trips";
import { dateArg, defineTool, idArg, moneyArg, toCents } from "../tool";

const when = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
  .describe("Local date YYYY-MM-DD, or date and time YYYY-MM-DDTHH:mm at that place");

export const tripTools = [
  defineTool({
    name: "list_trips",
    description: "The user's trips with dates and destinations. Use get_trip for bookings, costs and clashes.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listTrips(s));
      return {
        trips: rows.map((t) => ({
          id: t.id,
          name: t.name,
          destination: t.destination,
          start: t.startDate,
          end: t.endDate,
          budget: t.budgetCents != null ? t.budgetCents / 100 : null,
        })),
      };
    },
  }),
  defineTool({
    name: "get_trip",
    description: "One trip: bookings and plans by day, costs vs. budget, and clashes with shifts, classes and deadlines during it.",
    schema: z.object({ id: idArg("Trip") }),
    mutates: false,
    async execute({ id }, ctx) {
      const d = await ctx.run((s) => tripDetail(s, ctx.tz, id));
      if (!d) throw new Error("Trip not found");
      return {
        trip: { id: d.trip.id, name: d.trip.name, destination: d.trip.destination, start: d.trip.startDate, end: d.trip.endDate },
        items: d.items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          start: formatIn(i.startsAt, ctx.tz, "yyyy-MM-dd HH:mm"),
          location: i.location,
          confirmation: i.confirmation,
          cost: i.costCents != null ? i.costCents / 100 : null,
        })),
        costs: d.costCents / 100,
        budget: d.trip.budgetCents != null ? d.trip.budgetCents / 100 : null,
        clashes: d.clashes,
        viewAt: `/trips/${d.trip.id}`,
      };
    },
  }),
  defineTool({
    name: "create_trip",
    description: "Create a trip (name, destination, dates, optional budget). Then add bookings and plans with add_trip_items.",
    schema: z.object({
      name: z.string().max(120),
      destination: z.string().max(120).optional(),
      startDate: dateArg(),
      endDate: dateArg(),
      budget: moneyArg("Trip budget").optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const t = await ctx.run((s) =>
        createTrip(s, {
          name: a.name,
          destination: a.destination,
          startDate: a.startDate,
          endDate: a.endDate,
          budgetCents: a.budget != null ? toCents(a.budget) : null,
        }),
      );
      return { id: t.id, name: t.name, viewAt: `/trips/${t.id}` };
    },
  }),
  defineTool({
    name: "add_trip_items",
    description:
      "Add bookings or plan steps to a trip (flights, trains, hotels, activities, layover plans). Each also goes on the calendar. Only add prices you got from a tool or the user.",
    schema: z.object({
      tripId: idArg("Trip"),
      items: z
        .array(
          z.object({
            kind: z.enum(["flight", "train", "hotel", "car", "activity", "other"]),
            title: z.string().max(200),
            start: when,
            end: when.optional(),
            location: z.string().max(200).optional(),
            confirmation: z.string().max(60).optional(),
            cost: moneyArg("Cost").optional(),
          }),
        )
        .min(1)
        .max(30),
    }),
    mutates: true,
    async execute(a, ctx) {
      const created = [];
      for (const i of a.items)
        created.push(
          await ctx.run((s) =>
            addTripItem(s, ctx.tz, {
              tripId: a.tripId,
              kind: i.kind,
              title: i.title,
              start: i.start,
              end: i.end,
              location: i.location,
              confirmation: i.confirmation,
              costCents: i.cost != null ? toCents(i.cost) : null,
            }),
          ),
        );
      return { created: created.map((c) => ({ id: c.id, title: c.title })), viewAt: `/trips/${a.tripId}` };
    },
  }),
  defineTool({
    name: "delete_trip_item",
    description: "Remove one booking or plan step from a trip (and the calendar).",
    schema: z.object({ id: idArg("Trip item") }),
    mutates: true,
    confirm: () => "Remove this item from the trip and your calendar?",
    async execute({ id }, ctx) {
      const r = await ctx.run((s) => deleteTripItem(s, id));
      if (!r) throw new Error("Trip item not found");
      return { deleted: r.title };
    },
  }),
];
