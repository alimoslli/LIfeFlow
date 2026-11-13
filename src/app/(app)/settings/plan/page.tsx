import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { requireUser } from "@/server/auth/current-user";
import { isPro, legacyBilling } from "@/server/billing";
import { audienceFor, paywallActive, planOptions } from "@/server/plans";
import { SettingsHeader } from "../settings-header";
import { FREE_FEATURES, PAID_FEATURES, STANDARD_FEATURES, STUDENT_FEATURES } from "@/lib/plan-features";
import { NOT_SCHOOL_MESSAGE } from "@/lib/school-domains";
import { Input } from "@/components/ui/field";
import { ADDRESS_FULL_MESSAGE, studentVerificationState } from "@/server/services/email-confirm";
import { getDb } from "@/server/db/client";
import { choosePlanAction, confirmStudentCodeAction, manageBillingAction, sendStudentCodeAction, upgradeAction } from "./actions";

export const metadata: Metadata = { title: "Plan" };

const STUDENT_NOTES: Record<string, string> = {
  sent: "Code sent. It works once, for 10 minutes.",
  verified: "Student email confirmed. Choose your plan below.",
  not_school: NOT_SCHOOL_MESSAGE,
  invalid: "That doesn't look like an email address.",
  unavailable: "Email codes aren't available yet.",
  too_many: "We've sent a few codes already. Use the newest one, or try again in an hour.",
  address_full: ADDRESS_FULL_MESSAGE,
  failed: "We couldn't send the email just now. Try again in a minute.",
  wrong: "That code didn't match. Try again.",
  expired: "That code ran out. Send a new one.",
  none: "That code didn't work. Send a new one.",
  locked: "Too many tries. Send a new code.",
};

/** The plan picker and paywall. Not there at all (a 404) while the plans switch is off. Payments and cancelling happen on Stripe's pages. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ upgraded?: string; need?: string; problem?: string; student?: string }> }) {
  const legacy = !paywallActive() && !!legacyBilling();
  if (!paywallActive() && !legacy) notFound();
  const sp = await searchParams;
  const u = await requireUser();
  const pro = isPro(u);
  const options = legacy ? [] : planOptions(audienceFor(u));
  const student = options.some((o) => o.key.startsWith("student_")) && !pro ? await studentVerificationState(getDb(), u.id) : null;
  // Inside the App Store app, subscriptions must go through Apple, so the web checkout isn't offered there.
  const inApp = ((await headers()).get("user-agent") ?? "").includes("LifeFlowApp");
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Plan" />
      {sp.upgraded && !pro && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">Payment received. Your plan turns on in a moment; refresh if it doesn&apos;t.</p>
      )}
      {sp.problem && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">That didn&apos;t go through. Nothing was charged. Try again in a bit.</p>
      )}
      {sp.student && STUDENT_NOTES[sp.student] && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">{STUDENT_NOTES[sp.student]}</p>}
      {sp.need && !pro && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.9375rem]">Connecting your accounts is part of a plan.</p>}
      <Card className="p-5" data-testid="free-card">
        <p className="text-[0.8125rem] text-muted">Your plan</p>
        <p className="font-display text-[2.125rem] leading-tight font-medium">{pro ? "LifeFlow Pro" : "Free"}</p>
        <ul className="mt-4 flex flex-col gap-2 text-[0.9375rem]">
          {(pro ? PAID_FEATURES : FREE_FEATURES).map((f) => (
            <li key={f} className="flex items-center gap-2">
              <PixelIcon name="check" className={pro ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"} /> {f}
            </li>
          ))}
        </ul>
        {pro && (
          <form action={manageBillingAction} className="mt-5">
            <Button type="submit" className="min-h-11 w-full">
              Manage or cancel
            </Button>
          </form>
        )}
      </Card>
      {legacy && !pro && !inApp && (
        <form action={upgradeAction}>
          <Button type="submit" className="min-h-11 w-full">
            Upgrade to Pro
          </Button>
        </form>
      )}
      {!pro &&
        !legacy &&
        (inApp ? (
          <p className="text-[0.9375rem] text-text-2">Plans aren&apos;t available in the app yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="plan-options">
            {options.map((o) => (
              <Card key={o.key} className="flex flex-col gap-3 p-5">
                <p className="font-display text-[1.375rem] leading-tight font-medium">{o.title}</p>
                <p className="text-[0.9375rem] text-text-2">{o.blurb}</p>
                <p className="text-[1.5rem] font-medium">{o.priceLabel}</p>
                <ul className="flex flex-col gap-2 text-[0.9375rem]" data-testid={`features-${o.key.startsWith("student_") ? "student" : "standard"}`}>
                  {(o.key.startsWith("student_") ? STUDENT_FEATURES : STANDARD_FEATURES).map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <PixelIcon name="check" className="h-4 w-4 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                {o.key.startsWith("student_") && student?.step !== "verified" ? (
                  <div className="flex flex-col gap-3" data-testid="student-verify">
                    <p className="text-[0.9375rem] text-text-2">
                      The student price needs a student email. We send a code to it each time you pay. Renewals don&apos;t ask again.
                    </p>
                    <form action={sendStudentCodeAction} className="flex flex-col gap-2">
                      <Input name="email" type="email" required autoComplete="off" placeholder="Your school email" aria-label="Your school email" />
                      <Button type="submit" className="min-h-11 w-full">
                        {student?.step === "sent" ? "Send a new code" : "Send code"}
                      </Button>
                    </form>
                    {student?.step === "sent" && (
                      <form action={confirmStudentCodeAction} className="flex flex-col gap-2">
                        <p className="text-[0.8125rem] text-muted">Sent to {student.masked}</p>
                        <Input
                          name="code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          placeholder="6-digit code"
                          aria-label="6-digit code"
                        />
                        <Button type="submit" className="min-h-11 w-full">
                          Confirm code
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <form action={choosePlanAction}>
                    <input type="hidden" name="plan" value={o.key} />
                    <Button type="submit" className="min-h-11 w-full">
                      Choose {o.title}
                    </Button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
