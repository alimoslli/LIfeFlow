import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, FREE_JARVIS_PER_DAY, isPro } from "@/server/billing";
import { SettingsHeader } from "../settings-header";
import { manageBillingAction, upgradeAction } from "./actions";

export const metadata: Metadata = { title: "Plan" };

const PRO = ["Unlimited Jarvis", "Bank and card sync", "Gmail and Google Calendar", "Text Jarvis from your phone", "Talk to Jarvis by voice"];

/** Free vs Pro, with one button. Payments and cancelling happen on Stripe's pages. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ upgraded?: string; need?: string }> }) {
  if (!billingConfig()) notFound();
  const sp = await searchParams;
  const u = await requireUser();
  const pro = isPro(u);
  // Inside the App Store app, subscriptions must go through Apple, so the web checkout isn't offered there.
  const inApp = ((await headers()).get("user-agent") ?? "").includes("LifeFlowApp");
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Plan" />
      {sp.upgraded && !pro && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Payment received. Pro turns on in a moment; refresh if it doesn&apos;t.</p>
      )}
      {sp.need === "google" && !pro && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">Connecting Google is part of Pro.</p>}
      <Card className="p-5">
        <p className="text-xs text-muted">Your plan</p>
        <p className="font-display text-[34px] leading-tight font-medium">{pro ? "LifeFlow Pro" : "Free"}</p>
        <ul className="mt-4 flex flex-col gap-2 text-[15px]">
          {PRO.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className={pro ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"} /> {f}
            </li>
          ))}
        </ul>
        {!pro && <p className="mt-4 text-sm text-text-2">Free keeps everything you add yourself, plus {FREE_JARVIS_PER_DAY} messages with Jarvis a day.</p>}
        {inApp && !pro ? (
          <p className="mt-5 text-sm text-text-2">Upgrading isn&apos;t available in the app yet.</p>
        ) : (
          <form action={pro ? manageBillingAction : upgradeAction} className="mt-5">
            <Button type="submit" className="w-full">
              {pro ? "Manage or cancel" : "Upgrade to Pro"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
