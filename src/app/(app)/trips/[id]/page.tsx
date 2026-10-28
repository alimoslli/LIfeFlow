import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Hotel, MapPin, Plane, Sparkles, TrainFront, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, Progress } from "@/components/ui/surface";
import { formatDateStr, formatIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { tripDetail } from "@/server/services/trips";
import { addTripItemAction, deleteTripAction, deleteTripItemAction } from "../actions";

export const metadata: Metadata = { title: "Trip" };
const ICON = { flight: Plane, train: TrainFront, hotel: Hotel, car: MapPin, activity: MapPin, other: MapPin } as const;

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await withCurrentUser(async (s, u) => ({ detail: await tripDetail(s, u.timezone, id), tz: u.timezone }));
  if (!d.detail) notFound();
  const { trip, days, clashes, costCents, goal } = d.detail;
  const prompt = `Plan my trip "${trip.name}"${trip.destination ? ` to ${trip.destination}` : ""} from ${trip.startDate} to ${trip.endDate}: getting there and around (routes, times, costs), what to do and where to eat, a realistic hour-by-hour plan with buffers, opening hours, entry/visa notes and a packing list. Use live web search and cite sources. Then offer to add the plan to this trip.`;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <header>
        <h1 className="font-display text-[32px] leading-tight font-medium tracking-tight break-words">{trip.name}</h1>
        <p className="text-sm text-text-2">
          {formatDateStr(trip.startDate, "EEE, MMM d")} to {formatDateStr(trip.endDate, "EEE, MMM d, yyyy")}
          {trip.destination ? ` · ${trip.destination}` : ""}
        </p>
        <div className="mt-3">
          <AskJarvisButton prompt={prompt} send className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-text">
            <Sparkles className="h-4 w-4" /> Plan this trip with Jarvis
          </AskJarvisButton>
        </div>
      </header>

      {clashes.length > 0 && (
        <Card className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">During this trip you also have</p>
            <ul className="mt-1 text-sm text-text-2">
              {clashes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <p className="text-sm text-muted">Trip costs so far</p>
        <p className="tabular text-xl font-medium">
          {formatCents(costCents)}
          {trip.budgetCents ? <span className="text-sm text-muted"> of {formatCents(trip.budgetCents)} budget</span> : null}
        </p>
        {trip.budgetCents ? <Progress value={Math.min(100, Math.round((costCents / trip.budgetCents) * 100))} className="mt-2" /> : null}
        {goal && (
          <p className="mt-2 text-sm text-text-2">
            Saving for it: {goal.name}, {formatCents(goal.savedCents)} of {formatCents(goal.targetCents)}.
          </p>
        )}
      </Card>

      {days.length === 0 && <p className="text-sm text-muted">No bookings yet. Add one below or forward the confirmation email to your Inbox.</p>}
      {days.map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-medium text-muted">{formatDateStr(day, "EEEE, MMMM d")}</h2>
          <ul className="flex flex-col gap-2">
            {items.map((i) => {
              const Icon = ICON[i.kind];
              return (
                <li key={i.id} className="flex items-start gap-3 rounded-3xl bg-surface p-4 shadow-soft">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium break-words">{i.title}</p>
                    <p className="text-xs text-muted">
                      {formatIn(i.startsAt, d.tz, "h:mm a")}
                      {i.endsAt ? ` to ${formatIn(i.endsAt, d.tz, "MMM d, h:mm a")}` : ""}
                      {i.location ? ` · ${i.location}` : ""}
                      {i.confirmation ? ` · Conf. ${i.confirmation}` : ""}
                      {i.costCents ? ` · ${formatCents(i.costCents)}` : ""}
                    </p>
                  </div>
                  <ActionButton
                    action={deleteTripItemAction.bind(null, trip.id, i.id)}
                    title={`Remove ${i.title}`}
                    className="tap flex items-center justify-center text-muted hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </ActionButton>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Card className="p-5">
        <h2 className="font-medium">Add to the trip</h2>
        <ActionForm action={addTripItemAction.bind(null, trip.id)} className="mt-3 gap-3">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Field label="Type" htmlFor="ti-kind">
              <Select id="ti-kind" name="kind" defaultValue="activity" className="h-11">
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="hotel">Hotel</option>
                <option value="car">Car</option>
                <option value="activity">Plan</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="What" htmlFor="ti-title">
              <Input id="ti-title" name="title" required maxLength={200} placeholder="Louvre, 10am entry" className="h-11" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="ti-date">
              <Input id="ti-date" name="date" type="date" required defaultValue={trip.startDate} className="h-11" />
            </Field>
            <Field label="Time (optional)" htmlFor="ti-time">
              <Input id="ti-time" name="time" type="time" className="h-11" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confirmation (optional)" htmlFor="ti-conf">
              <Input id="ti-conf" name="confirmation" maxLength={60} className="h-11" />
            </Field>
            <Field label="Cost ($, optional)" htmlFor="ti-cost">
              <Input id="ti-cost" name="cost" inputMode="decimal" className="h-11" />
            </Field>
          </div>
          <SubmitButton className="self-start max-sm:h-12 max-sm:w-full">Add</SubmitButton>
        </ActionForm>
      </Card>
      <ActionButton
        action={deleteTripAction.bind(null, trip.id)}
        confirm={`Delete "${trip.name}" and its bookings from your calendar?`}
        className="self-center rounded-full px-4 text-sm text-danger"
      >
        Delete trip
      </ActionButton>
    </div>
  );
}
