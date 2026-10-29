import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { CountUp } from "@/components/motion/count-up";
import { addDaysStr, formatDateStr, formatIn, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { budgetWarnings, cashForecast } from "@/server/services/finance/forecast";
import { recordNetWorth } from "@/server/services/finance/investing";
import { moneyOverview } from "@/server/services/finance/overview";
import { spendingByCategory, upcomingRecurring } from "@/server/services/finance/planning";
import { PlaidLinkButton } from "@/components/finance/plaid-link";
import { plaidConfig } from "@/server/integrations/plaid";

export const metadata: Metadata = { title: "Money" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function MoneyPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const o = await moneyOverview(s, today);
    if (!o.hasAccounts) return { empty: true as const, plaidReady: !!plaidConfig() };
    await recordNetWorth(s, today);
    const [forecast, warnings, categories, bills] = await series(
      () => cashForecast(s, today, 30),
      () => budgetWarnings(s, today),
      () => spendingByCategory(s, o.month.period.from, o.month.period.to),
      () => upcomingRecurring(s, today, addDaysStr(today, 30)),
    );
    return {
      empty: false as const,
      o,
      forecast,
      warnings,
      categories,
      bills: bills.filter((b) => b.amountCents < 0),
      today,
      tz: u.timezone,
    };
  });

  if (d.empty) {
    return (
      <div className="mx-auto max-w-[640px]">
        <h1 className="font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
        <div className="mt-8 rounded-3xl bg-surface p-8 text-center shadow-soft">
          <Landmark className="mx-auto h-7 w-7 text-accent" />
          <p className="mt-3 text-[17px]">Connect a bank or add an account to see where you stand.</p>
          <p className="mt-1 text-sm text-muted">Then you&apos;ll see what you have, what you spent, and your bills.</p>
          <div className="mx-auto mt-5 flex max-w-sm flex-col items-center gap-3 text-left">
            <PlaidLinkButton configured={d.plaidReady} />
            <Link href="/finances/accounts" className="text-sm font-medium text-accent">
              Or add an account yourself
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { o, forecast, warnings } = d;
  const m = o.month;
  const net = m.incomeCents - m.netSpendingCents;
  const alerts = [
    ...forecast.warnings.map((w) => ({ tone: "danger" as const, text: w, fix: null as string | null, href: "/finances/bills" })),
    ...warnings
      .filter((w) => w.status !== "on_track")
      .map((w) => ({
        tone: w.status === "over" ? ("danger" as const) : ("warning" as const),
        text:
          w.status === "over"
            ? `${w.categoryName} is over budget: ${whole(w.spentCents)} of ${whole(w.limitCents)}.`
            : `${w.categoryName} is on pace for ${whole(w.projectedCents)}, over its ${whole(w.limitCents)} budget.`,
        fix: w.fix,
        href: "/finances/budgets",
      })),
  ].slice(0, 4);
  const topCats = d.categories.filter((c) => c.cents > 0).slice(0, 5);
  const maxCat = Math.max(1, ...topCats.map((c) => c.cents));
  const asOf = o.balances.asOf ? formatIn(o.balances.asOf, d.tz, "MMM d, h:mm a") : null;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-9">
      <div className="contents">
        <header className="animate-rise max-lg:order-[-3]">
          <p className="text-sm text-muted">{formatDateStr(d.today, "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
          <p className="mt-2 text-xs text-muted">
            Balances as of {asOf ?? "unknown"}
            {o.balances.hasDemoData ? " · Sample data" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["/finances/budgets", "Budget"],
              ["/finances/subscriptions", "Subscriptions"],
              ["/wealth", "Investments"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium shadow-soft">
                {label}
              </Link>
            ))}
          </div>
        </header>

        {/* Available now: money in checking and cash that can be spent today */}
        <section className="animate-rise max-lg:order-[-3]" style={{ animationDelay: "60ms" }} aria-label="Available now">
          <div data-tilt className="lf-sheen relative overflow-hidden rounded-[28px] bg-hero text-hero-text shadow-lift">
            <div className="relative p-6 pb-5">
              <Waves />
              <p className="relative flex items-center gap-1.5 text-sm opacity-80">
                <Wallet className="h-3.5 w-3.5" /> Available now
              </p>
              <p className="tabular relative mt-1 font-display text-[54px] leading-none font-medium tracking-tight">
                <CountUp cents={o.balances.cashCents} />
              </p>
              <p className="relative mt-2 text-sm opacity-80">In checking and cash. Savings and cards are under Accounts.</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/15 border-t border-white/15">
              <Stat
                label={
                  <>
                    <ArrowUpRight className="h-3 w-3" /> Spent
                  </>
                }
                cents={m.netSpendingCents}
              />
              <Stat
                label={
                  <>
                    <ArrowDownLeft className="h-3 w-3" /> Came in
                  </>
                }
                cents={m.incomeCents}
              />
            </div>
            <p className="relative border-t border-white/15 px-6 py-2.5 text-xs opacity-75">
              Spent and came in cover {m.period.label} · {net >= 0 ? `${whole(net)} more came in than went out` : `${whole(-net)} more went out than came in`}
            </p>
          </div>
        </section>

        {alerts.length > 0 && (
          <section className="animate-rise max-lg:order-[-2]" style={{ animationDelay: "140ms" }} aria-label="Heads up">
            <h2 className="mb-3 text-[15px] font-semibold">Heads up</h2>
            <ul className="flex flex-col gap-2.5">
              {alerts.map((a, i) => (
                <li key={i} data-tilt className="flex gap-3.5 rounded-3xl bg-surface p-4 shadow-soft">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
                    )}
                  >
                    <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-[15px] leading-snug">{a.text}</p>
                    {a.fix && <p className="mt-1 text-sm text-text-2">{a.fix}</p>}
                    <Link href={a.href} className="-mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">
                      Review <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="animate-rise" style={{ animationDelay: "180ms" }} aria-label="Cash forecast">
          <Title href="/finances/bills">Next 30 days in checking</Title>
          <div data-tilt className="rounded-3xl bg-surface p-5 shadow-soft">
            <p className="text-sm text-text-2">
              Lowest point {whole(forecast.lowestWithoutPay.cents)} on {formatDateStr(forecast.lowestWithoutPay.date, "MMM d")} if no pay arrives
              {forecast.expectedPay.length ? `, ${whole(forecast.lowestWithPay.cents)} with expected pay` : ""}.
            </p>
            <div className="mt-4">
              <LineChart
                label="Projected checking balance for the next 30 days"
                series={[
                  { name: "Without pay", points: forecast.points.map((p) => ({ date: p.date, cents: p.withoutPayCents })), className: "stroke-accent" },
                  ...(forecast.expectedPay.length
                    ? [
                        {
                          name: "With expected pay",
                          dashed: true,
                          points: forecast.points.map((p) => ({ date: p.date, cents: p.withPayCents })),
                          className: "stroke-muted",
                        },
                      ]
                    : []),
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              Includes {forecast.bills.length} tracked bill{forecast.bills.length === 1 ? "" : "s"} and about {whole(forecast.typicalDailySpendCents)} a day of
              usual spending.
            </p>
          </div>
        </section>

        {topCats.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "220ms" }} aria-label="Where it went">
            <Title href="/finances/transactions">Where it went, {m.period.label}</Title>
            <ul data-tilt className="flex flex-col gap-4 rounded-3xl bg-surface p-5 shadow-soft">
              {topCats.map((c) => (
                <li key={c.name}>
                  <div className="mb-1.5 flex justify-between text-[15px]">
                    <span>{c.name}</span>
                    <span className="tabular text-text-2">{whole(c.cents)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2">
                    <div className="lf-grow h-1.5 rounded-full bg-accent" style={{ width: `${(c.cents / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.bills.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "260ms" }} aria-label="Bills">
            <Title href="/finances/bills">Bills in the next 30 days</Title>
            <ul data-tilt className="flex flex-col divide-y divide-border rounded-3xl bg-surface px-5 shadow-soft">
              {d.bills.slice(0, 6).map((c) => (
                <li key={`${c.id}${c.date}`} className="flex items-center gap-4 py-3.5">
                  <span className="tabular w-14 shrink-0 text-sm text-muted">{formatDateStr(c.date, "MMM d")}</span>
                  <span className="flex-1 line-clamp-2 break-words text-[15px]">{c.name}</span>
                  <span className="tabular text-[15px]">{whole(-c.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, cents }: { label: React.ReactNode; cents: number }) {
  return (
    <div className="p-4">
      <p className="flex items-center gap-1 text-xs opacity-75">{label}</p>
      <p className="tabular mt-1 text-lg font-medium">
        <CountUp cents={cents} />
      </p>
    </div>
  );
}

function Waves() {
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          className="lf-draw"
          pathLength={1}
          style={{ animationDelay: `${120 + i * 70}ms`, animationDuration: "1.4s" }}
          d={`M0 ${120 - i * 9} C 90 ${60 + i * 6}, 210 ${150 - i * 5}, 400 ${50 + i * 7}`}
          fill="none"
          stroke="white"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

function Title({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      <Link href={href} className="-my-3 flex min-h-11 shrink-0 items-center gap-1 text-sm text-muted hover:text-text">
        See all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
