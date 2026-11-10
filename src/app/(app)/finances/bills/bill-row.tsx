"use client";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { ActionState } from "@/server/actions";
import { CancelHelp } from "../subscriptions/cancel-help";

type Act = () => Promise<ActionState>;
type FormAct = (p: ActionState, fd: FormData) => Promise<ActionState>;

/** One regular charge (or paycheck) as the Bills page shows it, already worded on the server. */
export type BillView = {
  id: string;
  name: string;
  /** "Subscription", "Bill", "Paycheck", "Other". */
  label: string;
  subscription: boolean;
  every: string;
  amount: string;
  yearly: string | null;
  /** "Mon, Nov 30", and the chip's "NOV" and "30". */
  next: string | null;
  month: string | null;
  day: string | null;
  paused: boolean;
  badges: { text: string; tone: "danger" | "warning" | "success" }[];
  via: "apple" | "google_play" | "paypal" | null;
  trialEndsOn: string | null;
  notUsing: boolean;
  cancelHelp: { answer: string; sources: { title: string; url: string }[] } | null;
};

const TONE = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success" };
const VIA_WORDS = { apple: "billed by Apple", google_play: "billed by Google Play", paypal: "paid through PayPal" };

/**
 * A row you can read at a glance (when, what, how much); a tap opens its sheet with everything you can do about it, so the
 * page itself stays one calm list (owner, 2026-11-10: the old page was a wall of buttons and a form).
 */
export function BillRow({
  b,
  acts,
}: {
  b: BillView;
  acts: { keep?: Act; remind?: Act; notUsing?: Act; cancelled?: Act; trial?: FormAct; pause: Act; resume: Act; stop: Act };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="bill"
        className="lf-hop flex w-full items-center gap-3 rounded-[1.25rem] bg-surface p-3 text-left shadow-soft ring-1 ring-border/60 hover:shadow-lift"
      >
        <span className="lf-chip-night h-12 w-12 shrink-0 content-center rounded-[0.875rem] leading-none" aria-hidden>
          {b.month ? (
            <>
              <span className="text-[0.5625rem] font-semibold tracking-[0.12em]">{b.month}</span>
              <span className="mt-0.5 text-[1.0625rem] font-semibold text-white">{b.day}</span>
            </>
          ) : (
            <span className="text-[0.75rem] text-white">—</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold">{b.name}</span>
          <span className="block truncate text-[0.8125rem] text-muted">
            {b.label} · every {b.every}
            {b.paused ? " · paused" : ""}
          </span>
        </span>
        {b.badges[0] && (
          <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold sm:inline ${TONE[b.badges[0].tone]}`}>
            {b.badges[0].text}
          </span>
        )}
        <span className="tabular shrink-0 text-[0.9375rem] font-semibold">{b.amount}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={b.name}>
        <div className="flex flex-col gap-5">
          <div>
            <p className="tabular font-display text-[2.25rem] leading-none font-medium tracking-tight">
              {b.amount}
              <span className="ml-1.5 font-sans text-[0.9375rem] font-normal text-muted">/ {b.every}</span>
            </p>
            <p className="mt-2 text-sm text-text-2">
              {b.next ? `Next ${b.label === "Paycheck" ? "one" : "charge"} ${b.next}` : "Next date unknown"}
              {b.yearly ? ` · ${b.yearly} a year` : ""}
              {b.via ? ` · ${VIA_WORDS[b.via]}` : ""}
            </p>
            {b.badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.badges.map((x) => (
                  <span key={x.text} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[x.tone]}`}>
                    {x.text}
                  </span>
                ))}
              </div>
            )}
          </div>

          {b.subscription && acts.keep && acts.remind ? (
            <>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={acts.keep} className="lf-sb lf-sb-app lf-sb-sm">
                  Keep it
                </ActionButton>
                <CancelHelp id={b.id} name={b.name} via={b.via} saved={b.cancelHelp} />
                <ActionButton action={acts.remind} className="lf-sb lf-sb-app lf-sb-sm">
                  Remind me before renewal
                </ActionButton>
              </div>
              {acts.trial && (
                <ActionForm action={acts.trial} reset={false} className="flex-row flex-wrap items-end gap-2">
                  <Field label="Free trial ends on" htmlFor={`trial-${b.id}`}>
                    <Input id={`trial-${b.id}`} type="date" name="trialEndsOn" defaultValue={b.trialEndsOn ?? ""} />
                  </Field>
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
              )}
              <div className="flex flex-wrap gap-x-4 border-t border-border pt-3">
                {!b.notUsing && acts.notUsing && (
                  <ActionButton action={acts.notUsing} className="lf-sb-link text-sm text-text-2">
                    I don&apos;t use this anymore
                  </ActionButton>
                )}
                {acts.cancelled && (
                  <ActionButton
                    action={acts.cancelled}
                    confirm={`Mark ${b.name} as cancelled? Do this after you cancel it with the company.`}
                    className="lf-sb-link text-sm text-danger"
                  >
                    I cancelled it
                  </ActionButton>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {b.paused ? (
                <ActionButton action={acts.resume} className="lf-sb lf-sb-app lf-sb-sm">
                  Resume
                </ActionButton>
              ) : (
                <ActionButton action={acts.pause} className="lf-sb lf-sb-app lf-sb-sm">
                  Pause
                </ActionButton>
              )}
              <ActionButton action={acts.stop} confirm={`Stop tracking ${b.name}? It's kept in your history.`} className="lf-sb lf-sb-app lf-sb-sm">
                Stop tracking
              </ActionButton>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** "Add a bill": the form, one tap deeper (owner, 2026-11-10: no forms sitting on the page). */
export function AddBill({ action, today }: { action: FormAct; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lf-sb lf-sb-app lf-sb-sm self-start">
        <Plus className="h-4 w-4" aria-hidden /> Add a bill
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a bill">
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          <Field label="Name" htmlFor="r-name">
            <Input id="r-name" name="name" required placeholder="Spotify" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount ($)" htmlFor="r-amt">
              <Input id="r-amt" name="amount" inputMode="decimal" required placeholder="11.99" />
            </Field>
            <Field label="Type" htmlFor="r-kind">
              <Select id="r-kind" name="kind" defaultValue="bill">
                <option value="bill">Bill</option>
                <option value="subscription">Subscription</option>
                <option value="income">Paycheck</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Repeats" htmlFor="r-freq">
              <Select id="r-freq" name="frequency" defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </Field>
            <Field label="Next due" htmlFor="r-next">
              <Input id="r-next" name="nextDueDate" type="date" defaultValue={today} />
            </Field>
          </div>
          <SubmitButton className="self-end">Add</SubmitButton>
        </ActionForm>
      </Sheet>
    </>
  );
}
