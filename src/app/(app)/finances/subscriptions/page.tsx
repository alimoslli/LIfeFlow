import { BILLS_SUBS, SegmentedNav } from "@/components/ui/segmented-nav";
import type { Metadata } from "next";
import { AlertTriangle, Copy, Hourglass, TrendingUp, ZapOff } from "lucide-react";
import { moneyGate } from "@/app/(app)/money-gate";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/surface";
import { formatDateStr, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { subscriptionsOverview } from "@/server/services/finance/subscriptions";
import { CancelHelp } from "./cancel-help";
import { keepSubscriptionAction, markCancelledAction, notUsingAction, remindRenewalAction, setTrialAction, trackFoundAction } from "./actions";

export const metadata: Metadata = { title: "Subscriptions" };

const FREQ = { weekly: "week", biweekly: "2 weeks", monthly: "month", quarterly: "quarter", yearly: "year" } as const;
const usd = (c: number) => formatCents(Math.abs(c));

export default async function SubscriptionsPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser((s, u) => subscriptionsOverview(s, todayIn(u.timezone)));
  const active = d.subscriptions.filter((s) => s.status === "active");
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <header>
        <SegmentedNav label="Bills and subscriptions" items={BILLS_SUBS} active="subs" />
        <h1 className="mt-4 font-display text-[34px] leading-tight font-medium tracking-tight">Subscriptions</h1>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card as="div" className="p-4">
            <p className="text-sm text-muted">Per month</p>
            <p className="tabular font-display text-[28px] font-medium" data-testid="subs-monthly">
              {usd(d.monthlyCents)}
            </p>
          </Card>
          <Card as="div" className="p-4">
            <p className="text-sm text-muted">Per year</p>
            <p className="tabular font-display text-[28px] font-medium" data-testid="subs-yearly">
              {usd(d.yearlyCents)}
            </p>
          </Card>
        </div>
      </header>

      {d.flags.length > 0 && (
        <section aria-label="Worth a look" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Worth a look</h2>
          {d.flags.map((f, i) => (
            <Card as="div" key={i} className="flex items-start gap-3 p-4">
              {f.kind === "price_up" ? (
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              ) : f.kind === "trial" ? (
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              ) : f.kind === "duplicate" ? (
                <Copy className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              ) : (
                <ZapOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              )}
              <p className="text-[15px]">
                {f.kind === "price_up" && (
                  <>
                    <b>{f.name}</b> went up from {usd(f.fromCents)} to {usd(f.toCents)}: {usd(f.yearlyExtraCents)} more a year.
                  </>
                )}
                {f.kind === "trial" && (
                  <>
                    <b>{f.name}</b>&apos;s free trial ends {f.daysLeft === 0 ? "today" : `in ${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}`}, then{" "}
                    {usd(f.thenCents)}.
                  </>
                )}
                {f.kind === "duplicate" && (
                  <>
                    You pay for {f.names.length} {f.family} subscriptions ({f.names.join(", ")}): {usd(f.yearlyCents)} a year together.
                  </>
                )}
                {f.kind === "unused" && (
                  <>
                    You said you don&apos;t use <b>{f.name}</b>. It costs {usd(f.yearlyCents)} a year.
                  </>
                )}
              </p>
            </Card>
          ))}
        </section>
      )}

      <section aria-label="Your subscriptions" className="flex flex-col gap-3">
        {active.length === 0 && d.found.length === 0 && (
          <Card className="p-5 text-[15px] text-text-2">No subscriptions yet. Connect a bank or add transactions, and recurring charges show up here.</Card>
        )}
        {active.map((s) => (
          <Card as="article" key={s.id} className="p-4" data-testid="subscription">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold break-words">{s.name}</h3>
                <p className="text-sm text-text-2">
                  {usd(s.amountCents)} / {FREQ[s.frequency]} · {usd(s.yearlyCents)} a year
                </p>
                <p className="text-xs text-muted">
                  {s.nextDueDate ? `Next charge ${formatDateStr(s.nextDueDate, "EEE, MMM d")}` : "Next charge unknown"}
                  {s.via === "apple" ? " · billed by Apple" : s.via === "google_play" ? " · billed by Google Play" : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {s.priceUp && <Badge tone="danger">Price up</Badge>}
                {s.trialDaysLeft !== null && <Badge tone="warning">Trial</Badge>}
                {s.usage === "not_using" && <Badge tone="warning">Not using</Badge>}
                {s.keptAt && s.usage !== "not_using" && <Badge tone="success">Kept</Badge>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton action={keepSubscriptionAction.bind(null, s.id)} className="rounded-full bg-surface-2 px-4 text-sm font-medium">
                Keep
              </ActionButton>
              <CancelHelp
                id={s.id}
                name={s.name}
                via={s.via === "apple" || s.via === "google_play" || s.via === "paypal" ? s.via : null}
                saved={s.cancelHelp ? { answer: s.cancelHelp.answer, sources: s.cancelHelp.sources } : null}
              />
              <ActionButton action={remindRenewalAction.bind(null, s.id)} className="rounded-full bg-surface-2 px-4 text-sm font-medium">
                Remind me before renewal
              </ActionButton>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-muted">More</summary>
              <div className="flex flex-col gap-2 pt-2">
                {s.usage !== "not_using" && (
                  <ActionButton action={notUsingAction.bind(null, s.id)} className="self-start rounded-full px-1 text-sm text-text-2">
                    I don&apos;t use this anymore
                  </ActionButton>
                )}
                <ActionForm action={setTrialAction.bind(null, s.id)} reset={false} className="flex-row flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm text-text-2">
                    Free trial ends on
                    <input
                      type="date"
                      name="trialEndsOn"
                      defaultValue={s.trialEndsOn ?? ""}
                      className="h-11 rounded-xl border border-border bg-surface px-3 text-[16px]"
                    />
                  </label>
                  <SubmitButton variant="secondary" className="min-h-11">
                    Save
                  </SubmitButton>
                </ActionForm>
                <ActionButton
                  action={markCancelledAction.bind(null, s.id)}
                  confirm={`Mark ${s.name} as cancelled? Do this after you cancel it with the company.`}
                  className="self-start rounded-full px-1 text-sm text-danger"
                >
                  I cancelled it
                </ActionButton>
              </div>
            </details>
          </Card>
        ))}
      </section>

      {d.found.length > 0 && (
        <section aria-label="Found in your transactions" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Found in your transactions</h2>
          {d.found.map((c) => (
            <Card as="div" key={c.merchantKey} className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium break-words">{c.name}</p>
                <p className="text-xs text-muted">
                  About {usd(c.averageAmountCents)} every {FREQ[c.frequency]} · {c.occurrences} charges · next around{" "}
                  {formatDateStr(c.nextExpectedDate, "MMM d")}
                </p>
              </div>
              <ActionButton action={trackFoundAction.bind(null, c.merchantKey)} className="rounded-full bg-accent px-4 text-sm font-medium text-accent-text">
                Track
              </ActionButton>
            </Card>
          ))}
        </section>
      )}
      <p className="text-xs text-muted">Jarvis never cancels anything. Cancel help shows the steps; you decide.</p>
    </div>
  );
}
