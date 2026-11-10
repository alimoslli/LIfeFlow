import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import { AssistantName } from "@/components/assistant-name";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { MySkyling } from "@/components/skylings/sprite";
import { COINS, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { addDaysStr, formatDateStr, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listRecurring, suggestRecurring } from "@/server/services/finance/planning";
import { subscriptionsOverview } from "@/server/services/finance/subscriptions";
import { createRecurringAction, setRecurringStatusAction } from "../actions";
import { keepSubscriptionAction, markCancelledAction, notUsingAction, remindRenewalAction, setTrialAction } from "../subscriptions/actions";
import { AddBill, BillRow, type BillView } from "./bill-row";
import { PixelIcon } from "@/components/pixel/pixel-icon";

export const metadata: Metadata = { title: "Bills" };

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const EVERY: Record<string, string> = { weekly: "week", biweekly: "2 weeks", monthly: "month", quarterly: "3 months", yearly: "year" };
const LABEL: Record<string, string> = { bill: "Bill", subscription: "Subscription", income: "Paycheck", other: "Other" };
const usd = (c: number) => formatCents(Math.abs(c));
const whole = (c: number) => usd(c).replace(/\.00$/, "");

/**
 * Bills (owner, 2026-11-10: subscriptions don't get their own page): everything that leaves the account on its own, in one
 * calm list. What it costs a month up top, the few things worth a look, then each bill and subscription by its next date;
 * a tap opens what you can do. Charges found in the bank that aren't tracked yet come after, and adding one is a tap away.
 */
export default async function BillsPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const [items, subs, detected] = await series(
      () => listRecurring(s, { includeInactive: true }),
      () => subscriptionsOverview(s, today),
      () => suggestRecurring(s, today),
    );
    return { items, subs, detected, today, tz: u.timezone };
  });

  const live = d.items.filter((i) => i.status !== "cancelled");
  const out = live.filter((i) => i.amountCents < 0).sort((a, b) => (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"));
  const pay = live.filter((i) => i.amountCents > 0);
  const monthly = out.filter((i) => i.status === "active").reduce((sum, i) => sum - i.amountCents * PER_MONTH[i.frequency], 0);
  const subOf = new Map(d.subs.subscriptions.map((x) => [x.id, x]));
  // found in the bank and not tracked: only money going out, and not pennies (interest paid in isn't a bill)
  const found = d.detected.filter((c) => c.latestAmountCents <= -100 && c.kind !== "income").slice(0, 6);

  const view = (i: (typeof live)[number]): BillView => {
    const sub = subOf.get(i.id);
    const badges: BillView["badges"] = [];
    if (sub?.priceUp) badges.push({ text: "Price went up", tone: "danger" });
    if (sub && sub.trialDaysLeft !== null)
      badges.push({ text: `Trial ends in ${sub.trialDaysLeft} day${sub.trialDaysLeft === 1 ? "" : "s"}`, tone: "warning" });
    if (sub?.usage === "not_using") badges.push({ text: "Not using", tone: "warning" });
    if (sub?.keptAt && sub.usage !== "not_using") badges.push({ text: "Kept", tone: "success" });
    return {
      id: i.id,
      name: i.name,
      label: LABEL[i.kind] ?? "Bill",
      subscription: !!sub,
      every: EVERY[i.frequency] ?? i.frequency,
      amount: usd(i.amountCents),
      yearly: sub ? usd(sub.yearlyCents) : i.frequency === "yearly" ? null : usd(i.amountCents * PER_MONTH[i.frequency] * 12),
      next: i.nextDueDate ? formatDateStr(i.nextDueDate, "EEE, MMM d") : null,
      month: i.nextDueDate ? formatDateStr(i.nextDueDate, "MMM").toUpperCase() : null,
      day: i.nextDueDate ? formatDateStr(i.nextDueDate, "d") : null,
      paused: i.status === "paused",
      badges,
      via: sub && (sub.via === "apple" || sub.via === "google_play" || sub.via === "paypal") ? sub.via : null,
      trialEndsOn: sub?.trialEndsOn ?? null,
      notUsing: sub?.usage === "not_using",
      cancelHelp: sub?.cancelHelp ? { answer: sub.cancelHelp.answer, sources: sub.cancelHelp.sources } : null,
    };
  };
  const acts = (id: string, sub: boolean) => ({
    ...(sub
      ? {
          keep: keepSubscriptionAction.bind(null, id),
          remind: remindRenewalAction.bind(null, id),
          notUsing: notUsingAction.bind(null, id),
          cancelled: markCancelledAction.bind(null, id),
          trial: setTrialAction.bind(null, id),
        }
      : {}),
    pause: setRecurringStatusAction.bind(null, id, "paused"),
    resume: setRecurringStatusAction.bind(null, id, "active"),
    stop: setRecurringStatusAction.bind(null, id, "cancelled"),
  });

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-7">
      <header>
        <h1 className="font-display text-[2.375rem] leading-none font-medium tracking-tight">Bills</h1>
        <p className="mt-2 text-sm text-text-2">Everything that leaves your account on its own, subscriptions included.</p>
      </header>

      {/* what it all costs, in the sky, with their skyling on its coins */}
      <SkyWindow tz={d.tz} className="rounded-[1.75rem]">
        <div className="relative min-h-[11rem] px-6 pt-6 pb-6">
          <p className="text-sm text-white/80">Every month</p>
          <p className="lf-sw-num tabular mt-1 font-display text-[3rem] leading-none font-medium tracking-tight" data-testid="bills-monthly">
            {whole(Math.round(monthly))}
          </p>
          <p className="mt-2 max-w-[62%] text-sm text-white/80">
            {whole(Math.round(monthly * 12))} a year · {out.length} {out.length === 1 ? "thing" : "things"} you pay regularly
          </p>
          <div className="absolute right-5 bottom-0 flex flex-col items-center">
            <MySkyling className="relative z-10 -mb-1.5 h-16 w-16 cursor-pointer" />
            <PixelArt art={COINS} className="w-12" />
          </div>
        </div>
      </SkyWindow>

      {d.subs.flags.length > 0 && (
        <section aria-label="Worth a look" className="flex flex-col gap-2">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Worth a look</h2>
          <ul className="lf-tiles">
            {d.subs.flags.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3.5">
                <span className={`lf-chip-night mt-0.5 h-9 w-9 shrink-0 rounded-[0.75rem] ${f.kind === "price_up" ? "text-dawn-glow" : ""}`} aria-hidden>
                  {f.kind === "price_up" ? (
                    <PixelIcon name="up" className="h-4 w-4" />
                  ) : f.kind === "trial" ? (
                    <PixelIcon name="hourglass" className="h-4 w-4" />
                  ) : f.kind === "duplicate" ? (
                    <PixelIcon name="copy" className="h-4 w-4" />
                  ) : (
                    <PixelIcon name="sleep" className="h-4 w-4" />
                  )}
                </span>
                <p className="text-[0.9375rem] leading-snug">
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
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Coming up" className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Coming up</h2>
          <AddBill action={createRecurringAction} today={d.today} />
        </div>
        {out.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-surface p-4 shadow-soft">
            <span className="lf-chip-night h-10 w-10 shrink-0 rounded-[0.75rem]" aria-hidden>
              <PixelIcon name="repeat" className="h-4 w-4" />
            </span>
            <p className="text-[0.9375rem] text-text-2">
              {d.subs.historyDays === 0
                ? "Nothing yet. Connect your bank and your bills and subscriptions show up here by themselves."
                : "Nothing tracked yet. Anything found in your bank is just below, one tap to track."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {out.map((i) => (
              <li key={i.id}>
                <BillRow b={view(i)} acts={acts(i.id, subOf.has(i.id))} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pay.length > 0 && (
        <section aria-label="Coming in" className="flex flex-col gap-2">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Coming in</h2>
          <ul className="flex flex-col gap-2">
            {pay.map((i) => (
              <li key={i.id}>
                <BillRow b={view(i)} acts={acts(i.id, false)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {found.length > 0 && (
        <section aria-label="Found in your bank" className="flex flex-col gap-2">
          <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Found in your bank</h2>
          <p className="-mt-1 text-sm text-text-2">Regular charges you aren&apos;t tracking yet.</p>
          <ul className="lf-tiles">
            {found.map((c) => (
              <li key={c.seriesKey} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-semibold">{c.name}</p>
                  <p className="text-[0.8125rem] text-muted">
                    {usd(c.latestAmountCents)} every {EVERY[c.frequency] ?? c.frequency} · next around {formatDateStr(c.nextExpectedDate, "MMM d")}
                  </p>
                </div>
                <ActionForm action={createRecurringAction} className="contents">
                  <input type="hidden" name="name" value={c.name} />
                  <input type="hidden" name="amount" value={(Math.abs(c.latestAmountCents) / 100).toFixed(2)} />
                  <input type="hidden" name="frequency" value={c.frequency} />
                  <input type="hidden" name="nextDueDate" value={c.nextExpectedDate ?? addDaysStr(d.today, 30)} />
                  <input type="hidden" name="kind" value={c.kind} />
                  <input type="hidden" name="detected" value="1" />
                  <SubmitButton variant="sun">Track</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        <AssistantName start /> never cancels anything for you. Cancel help shows the steps; you decide.
      </p>
    </div>
  );
}
