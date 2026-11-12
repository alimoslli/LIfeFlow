import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, FREE_JARVIS_PER_DAY, isPro } from "@/server/billing";
import { audienceFor, planOptions, plansEnabled } from "@/server/plans";
import { SettingsHeader } from "../settings-header";
import { choosePlanAction, manageBillingAction } from "./actions";

export const metadata: Metadata = { title: "Plan" };

const INCLUDED = [
  "More messages with your skyling",
  "Bank and card sync",
  "Gmail and Google Calendar",
  "Text your skyling from your phone",
  "Talk to your skyling by voice",
];

/** The plan picker and paywall. Not there at all (a 404) while the plans switch is off. Payments and cancelling happen on Stripe's pages. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ upgraded?: string; need?: string }> }) {
  if (!plansEnabled() || !billingConfig()) notFound();
  const sp = await searchParams;
  const u = await requireUser();
  const pro = isPro(u);
  const options = planOptions(audienceFor(u));
  // Inside the App Store app, subscriptions must go through Apple, so the web checkout isn't offered there.
  const inApp = ((await headers()).get("user-agent") ?? "").includes("LifeFlowApp");
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Plan" />
      {sp.upgraded && !pro && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">Payment received. Your plan turns on in a moment; refresh if it doesn&apos;t.</p>
      )}
      {sp.need && !pro && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">Connecting your accounts is part of a plan.</p>}
      <Card className="p-5">
        <p className="text-[0.8125rem] text-muted">Your plan</p>
        <p className="font-display text-[2.125rem] leading-tight font-medium">{pro ? "LifeFlow Pro" : "Free"}</p>
        <ul className="mt-4 flex flex-col gap-2 text-[0.9375rem]">
          {INCLUDED.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <PixelIcon name="check" className={pro ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"} /> {f}
            </li>
          ))}
        </ul>
        {!pro && (
          <p className="mt-4 text-[0.9375rem] text-text-2">
            Free keeps everything you add yourself, plus {FREE_JARVIS_PER_DAY} messages with your skyling a day.
          </p>
        )}
        {pro && (
          <form action={manageBillingAction} className="mt-5">
            <Button type="submit" className="min-h-11 w-full">
              Manage or cancel
            </Button>
          </form>
        )}
      </Card>
      {!pro &&
        (inApp ? (
          <p className="text-[0.9375rem] text-text-2">Plans aren&apos;t available in the app yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="plan-options">
            {options.map((o) => (
              <Card key={o.key} className="flex flex-col gap-3 p-5">
                <p className="font-display text-[1.375rem] leading-tight font-medium">{o.title}</p>
                <p className="text-[0.9375rem] text-text-2">{o.blurb}</p>
                <p className="text-[1.5rem] font-medium">{o.priceLabel}</p>
                <form action={choosePlanAction}>
                  <input type="hidden" name="plan" value={o.key} />
                  <Button type="submit" className="min-h-11 w-full">
                    Choose {o.title}
                  </Button>
                </form>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
