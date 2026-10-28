"use server";
import { redirect } from "next/navigation";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { addTripItem, createTrip, deleteTrip, deleteTripItem } from "@/server/services/trips";

const usdCents = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);

export async function createTripAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  let id = "";
  const r = await mutate(
    "trip.create",
    async (s) => {
      const t = await createTrip(s, {
        name: f.name ?? "",
        destination: f.destination || null,
        startDate: f.startDate ?? "",
        endDate: f.endDate ?? "",
        budgetCents: usdCents(f.budget),
      });
      id = t.id;
      return `Trip added: ${t.name}.`;
    },
    { revalidate: ["/trips"] },
  );
  if (r?.ok && id) redirect(`/trips/${id}`);
  return r;
}

export async function addTripItemAction(tripId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate(
    "trip.item_add",
    async (s, u) => {
      const start = f.date ? `${f.date}${f.time ? `T${f.time}` : ""}` : "";
      const item = await addTripItem(s, u.timezone, {
        tripId,
        kind: (f.kind || "activity") as "activity",
        title: f.title ?? "",
        start,
        end: f.endDate ? `${f.endDate}${f.endTime ? `T${f.endTime}` : ""}` : null,
        location: f.location || null,
        confirmation: f.confirmation || null,
        costCents: usdCents(f.cost),
      });
      return `Added "${item.title}" to the trip and your calendar.`;
    },
    { revalidate: [`/trips/${tripId}`, "/plan"] },
  );
}

export async function deleteTripItemAction(tripId: string, id: string): Promise<ActionState> {
  return mutate("trip.item_delete", async (s) => (await deleteTripItem(s, id), "Removed from the trip and your calendar."), {
    revalidate: [`/trips/${tripId}`],
  });
}

export async function deleteTripAction(id: string): Promise<ActionState> {
  const r = await mutate("trip.delete", async (s) => (await deleteTrip(s, id), "Trip deleted."), { revalidate: ["/trips"] });
  if (r?.ok) redirect("/trips");
  return r;
}
