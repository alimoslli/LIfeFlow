import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  Landmark,
  ListOrdered,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { CountUp } from "@/components/motion/count-up";
import { Pressable } from "@/components/motion/pressable";
import { Progress } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, formatIn, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { financialHealth } from "@/server/services/finance/coach";
import { budgetWarnings, cashForecast, safeToSpend } from "@/server/services/finance/forecast";
import { goalsWithPlans } from "@/server/services/finance/goals";
import { recordNetWorth } from "@/server/services/finance/investing";
import { moneyOverview } from "@/server/services/finance/overview";
import { spendingByCategory, upcomingRecurring } from "@/server/services/finance/planning";
import { AskJarvisButton, CelebrateGoal } from "./money-client";
import { PlaidLinkButton } from "@/components/finance/plaid-link";
import { plaidConfig } from "@/server/integrations/plaid";

export const metadata: Metadata = { title: "Money" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function MoneyPage() {
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const o = await moneyOverview(s, today);
    if (!o.hasAccounts) return { empty: true as const, plaidReady: !!plaidConfig() };
    await recordNetWorth(s, today);
    const [safe, forecast, warnings, goals, categories, bills, health] = await series(
      () => safeToSpend(s, today),
      () => cashForecast(s, today, 30),
      () => budgetWarnings(s, today),
      () => goalsWithPlans(s, today),
      () => spendingByCategory(s, o.month.period.from, o.month.period.to),
      () => upcomingRecurring(s, today, addDaysStr(today, 30)),
      () => financialHealth(s, today),
    );
    return {
      empty: false as const,
      o,
      safe,
      forecast,
      warnings,
      goals,
      categories,
      bills: bills.filter((b) => b.amountCents < 0),
      health,
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
          <p className="mt-1 text-sm text-muted">Then you&apos;ll see what&apos;s safe to spend, a cash forecast, smart budgets and your goals.</p>
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

  const { o, safe, forecast, warnings, goals, health } = d;
  const m = o.month;
  const net = m.incomeCents - m.netSpendingCents;
  const alerts = [
    ...forecast.warnings.map((w) => ({ tone: "danger" as const, text: w, fix: null as string | null, href: "/money/coach" })),
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
  const ret = o.investments?.returnPct ?? null;
  const activeGoals = goals.filter((g) => g.status !== "archived").slice(0, 3);
  const celebrate = goals.find((g) => g.milestoneToCelebrate);
  const asOf = o.balances.asOf ? formatIn(o.balances.asOf, d.tz, "MMM d, h:mm a") : null;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-9 lg:max-w-none lg:flex-row lg:items-start lg:gap-8">
      {celebrate && <CelebrateGoal goalId={celebrate.id} name={celebrate.name} percent={celebrate.milestoneToCelebrate!} />}
      <div className="contents lg:flex lg:min-w-0 lg:flex-[1.4] lg:flex-col lg:gap-9">
        <header className="animate-rise max-lg:order-[-3]">
          <p className="text-sm text-muted">{formatDateStr(d.today, "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
          <p className="mt-2 text-xs text-muted">
            Balances as of {asOf ?? "unknown"}
            {o.balances.hasDemoData ? " · Sample data" : ""}
          </p>
        </header>

        {/* Safe to spend: the number that matters day to day */}
        <section className="animate-rise max-lg:order-[-3]" style={{ animationDelay: "60ms" }} aria-label="Safe to spend">
          <div data-tilt className="lf-sheen relative overflow-hidden rounded-[28px] bg-hero text-hero-text shadow-lift">
            <div className="relative p-6 pb-5">
              <Waves />
              <p className="relative flex items-center gap-1.5 text-sm opacity-80">
                <Wallet className="h-3.5 w-3.5" /> Safe to spend today
              </p>
              <p className="tabular relative mt-1 font-display text-[54px] leading-none font-medium tracking-tight">
                <CountUp cents={safe.todayCents} />
              </p>
              <p className="relative mt-2 text-sm opacity-80">
                {safe.short
                  ? `Bills before ${safe.untilReason === "next_pay" ? "payday" : "month end"} take more than your cash. Spend only on essentials.`
                  : `${whole(safe.thisWeekCents)} for the rest of this week · ${whole(safe.perDayCents)} a day for the next ${safe.days} days${safe.untilReason === "next_pay" ? `, payday ${formatDateStr(safe.nextPay!.date, "MMM d")}` : ""}`}
              </p>
            </div>
            <details className="group relative border-t border-white/15 px-6 py-0.5 text-sm">
              <summary className="flex min-h-11 cursor-pointer list-none items-center opacity-80 [&::-webkit-details-marker]:hidden">
                How this is worked out
              </summary>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 opacity-90">
                <dt>Cash &amp; checking</dt>
                <dd className="tabular text-right">{whole(safe.cashCents)}</dd>
                <dt>Bills due by {formatDateStr(safe.billsUntil, "MMM d")}</dt>
                <dd className="tabular text-right">−{whole(safe.billsDueCents)}</dd>
                <dt>Goal savings planned</dt>
                <dd className="tabular text-right">−{whole(safe.goalSetAsideCents)}</dd>
                <dt>Spent today</dt>
                <dd className="tabular text-right">−{whole(safe.spentTodayCents)}</dd>
              </dl>
              <p className="mt-2 text-xs opacity-75">{safe.method} Expected pay is never counted.</p>
            </details>
            <div className="grid grid-cols-3 divide-x divide-white/15 border-t border-white/15">
              <Stat label="Cash & checking" cents={o.balances.cashCents} />
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
          <Title href="/money/coach">Next 30 days in checking</Title>
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

      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-9 lg:pt-[72px]">
        <section className="animate-rise max-lg:order-[-1]" style={{ animationDelay: "120ms" }} aria-label="Goals">
          <Title href="/finances/goals">Goals and dreams</Title>
          {activeGoals.length ? (
            <ul className="flex flex-col gap-2.5">
              {activeGoals.map((g) => (
                <li key={g.id}>
                  <Pressable>
                    <Link href="/finances/goals" data-tilt className="block rounded-3xl bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="line-clamp-2 break-words text-[15px] font-medium">{g.name}</span>
                        <span className="tabular shrink-0 text-sm text-text-2">
                          {whole(g.savedCents)} of {whole(g.targetCents)}
                        </span>
                      </div>
                      <Progress value={g.percent} className="mt-3" label={`${g.name} progress`} />
                      <p className="mt-2 text-xs text-muted">
                        {g.status === "achieved" || g.remainingCents === 0
                          ? "Reached. Well done!"
                          : g.projectedDate
                            ? `${whole(g.monthlyPaceCents)}/month finishes about ${formatDateStr(g.projectedDate, "MMM yyyy")}${g.targetDate ? (g.onTrack ? ", on time" : `, after your ${formatDateStr(g.targetDate, "MMM yyyy")} target`) : ""}`
                            : g.monthlyNeededCents
                              ? `Needs ${whole(g.monthlyNeededCents)}/month to reach it by ${formatDateStr(g.targetDate!, "MMM yyyy")}`
                              : "Set a monthly amount to see when you'll get there"}
                      </p>
                    </Link>
                  </Pressable>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-3xl bg-surface p-5 shadow-soft">
              <p className="text-[15px]">What are you saving for? An emergency fund, a trip, a car, an apartment?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/finances/goals" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-text">
                  Add a goal
                </Link>
                <AskJarvisButton prompt="Help me figure out my money goals. Ask me one question at a time.">Plan goals with Jarvis</AskJarvisButton>
              </div>
            </div>
          )}
        </section>

        {health.score != null && (
          <section className="animate-rise max-lg:order-[-1]" aria-label="Financial health">
            <Title href="/money/coach">Financial health</Title>
            <Pressable>
              <Link
                href="/money/coach"
                data-tilt
                className="flex items-center gap-5 rounded-3xl bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
              >
                <ScoreRing score={health.score} />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{health.band}</p>
                  {health.nextSteps[0] && <p className="mt-1 text-sm text-text-2">Next: {health.nextSteps[0]}</p>}
                </div>
              </Link>
            </Pressable>
          </section>
        )}

        {o.investments && (
          <section className="animate-rise" aria-label="Investments">
            <Title href="/wealth">Investments</Title>
            <Pressable>
              <Link data-tilt href="/wealth" className="block rounded-3xl bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted">Portfolio</p>
                    <p className="tabular mt-1 font-display text-[34px] leading-none font-medium">
                      <CountUp cents={o.investments.valueCents} />
                    </p>
                  </div>
                  {ret != null && (
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium",
                        ret >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                      )}
                    >
                      {ret >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {ret >= 0 ? "+" : ""}
                      {ret.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Investment account balances{o.investments.asOf ? `, updated ${formatIn(o.investments.asOf, d.tz, "MMM d, h:mm a")}` : ""}
                  {ret != null ? ". Return is all-time, on holdings with a known cost." : "."}
                </p>
              </Link>
            </Pressable>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3" aria-label="Savings, debt and net worth">
          <MiniStat label="Savings" cents={o.balances.savingsCents} />
          <MiniStat label="Owed on cards" cents={o.balances.creditOwedCents} icon={<CreditCard className="h-3.5 w-3.5" />} />
          <MiniStat label="Net worth" cents={o.balances.netWorthCents} icon={<ListOrdered className="h-3.5 w-3.5" />} />
          <div className="flex flex-col justify-center rounded-3xl bg-surface p-4 shadow-soft">
            <AskJarvisButton prompt="Give me my daily money check-in.">
              <Sparkles className="h-3.5 w-3.5" /> Daily check-in
            </AskJarvisButton>
          </div>
        </section>
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

function MiniStat({ label, cents, icon }: { label: string; cents: number; icon?: React.ReactNode }) {
  return (
    <div data-tilt className="rounded-3xl bg-surface p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {icon}
        {label}
      </p>
      <p className="tabular mt-1 text-xl font-medium">{whole(cents)}</p>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center" aria-label={`Score ${score} out of 100`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-surface-3" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-accent"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className="tabular text-lg font-semibold">{score}</span>
    </span>
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
