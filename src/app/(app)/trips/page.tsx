import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plane } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { formatDateStr, todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { listTrips } from "@/server/services/trips";
import { createTripAction } from "./actions";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage() {
  const { trips, today } = await withCurrentUser(async (s, u) => ({ trips: await listTrips(s), today: todayIn(u.timezone) }));
  const upcoming = trips.filter((t) => t.endDate >= today).reverse();
  const past = trips.filter((t) => t.endDate < today);
  const Row = ({ t }: { t: (typeof trips)[number] }) => (
    <li>
      <Link href={`/trips/${t.id}`} className="flex min-h-16 items-center gap-3 rounded-3xl bg-surface px-4 shadow-soft">
        <Plane className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium break-words">{t.name}</span>
          <span className="block text-xs text-muted">
            {formatDateStr(t.startDate, "MMM d")} to {formatDateStr(t.endDate, "MMM d, yyyy")}
            {t.destination ? ` · ${t.destination}` : ""}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted" />
      </Link>
    </li>
  );
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Trips</h1>
        <p className="mt-1 text-sm text-text-2">Plans, bookings and budget in one place.</p>
      </header>
      {upcoming.length > 0 && (
        <ul className="flex flex-col gap-2">
          {upcoming.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </ul>
      )}
      <Card className="p-5">
        <h2 className="font-medium">Plan a trip</h2>
        <ActionForm action={createTripAction} className="mt-3 gap-3">
          <Field label="Name" htmlFor="trip-name">
            <Input id="trip-name" name="name" required maxLength={120} placeholder="Spring break in Paris" className="h-11" />
          </Field>
          <Field label="Where" htmlFor="trip-dest">
            <Input id="trip-dest" name="destination" maxLength={120} placeholder="Paris" className="h-11" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="trip-start">
              <Input id="trip-start" name="startDate" type="date" required className="h-11" />
            </Field>
            <Field label="To" htmlFor="trip-end">
              <Input id="trip-end" name="endDate" type="date" required className="h-11" />
            </Field>
          </div>
          <Field label="Budget ($, optional)" htmlFor="trip-budget">
            <Input id="trip-budget" name="budget" inputMode="decimal" placeholder="1200" className="h-11 max-w-[10rem]" />
          </Field>
          <SubmitButton className="self-start max-sm:h-12 max-sm:w-full">Add trip</SubmitButton>
        </ActionForm>
        <p className="mt-3 text-xs text-muted">Or forward a booking confirmation to your Inbox and Jarvis builds the trip.</p>
      </Card>
      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Past trips</h2>
          <ul className="flex flex-col gap-2">
            {past.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
