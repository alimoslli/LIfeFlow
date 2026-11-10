import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Wallet } from "lucide-react";
import { CashOutlook } from "@/components/finance/cash-outlook";
import { CountUp } from "@/components/motion/count-up";
import { addDaysStr, formatDateStr, formatIn, monthStart, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { budgetWarnings, cashForecast } from "@/server/services/finance/forecast";
import { recordNetWorth } from "@/server/services/finance/investing";
import { moneyOverview } from "@/server/services/finance/overview";
import { spendingSummary } from "@/server/services/finance/insights";
import { spendingByCategory } from "@/server/services/finance/planning";
import { PlaidLinkButton } from "@/components/finance/plaid-link";
import { MySkyling } from "@/components/skylings/sprite";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { COINS, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { plaidConfig } from "@/server/integrations/plaid";

export const metadata: Metadata = { title: "Money" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function MoneyPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const o = await moneyOverview(s, today);
    if (!o.hasAccounts) return { empty: true as const, plaidReady: !!plaidConfig(), tz: u.timezone };
    await recordNetWorth(s, today);
    // Last month, so the first days of a month never read as just $0.
    const lastTo = addDaysStr(monthStart(today), -1);
    const lastFrom = monthStart(lastTo);
    const [forecast, warnings, categories, last, lastCategories] = await series(
      () => cashForecast(s, today, 30),
      () => budgetWarnings(s, today),
      () => spendingByCategory(s, o.month.period.from, o.month.period.to),
      () => spendingSummary(s, { from: lastFrom, to: lastTo }),
      () => spendingByCategory(s, lastFrom, lastTo),
    );
    return {
      empty: false as const,
      o,
      forecast,
      warnings,
      categories,
      last,
      lastCategories,
      lastLabel: formatDateStr(lastFrom, "MMMM"),
      today,
      tz: u.timezone,
    };
  });

  if (d.empty) {
    return (
      <div className="mx-auto max-w-[640px]">
        <h1 className="font-display text-[2.5rem] leading-none font-medium tracking-tight">Money</h1>
        <SkyWindow tz={d.tz} className="mt-8 rounded-[1.75rem]">
          <div className="relative min-h-[12rem] px-6 pt-6 pb-6">
            <PixelIcon name="money" className="h-8 w-8" />
            <p className="mt-3 max-w-[16rem] font-display text-[1.375rem] leading-snug font-medium">Connect a bank or add an account to see where you stand.</p>
            <p className="mt-2 max-w-[60%] text-sm text-white/80">Then you&apos;ll see what you have, what you spent, and your bills.</p>
            <SkylingOnCoins />
          </div>
        </SkyWindow>
        <div className="mt-5 rounded-[1.75rem] bg-surface p-6 shadow-soft">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-left">
            <PlaidLinkButton configured={d.plaidReady} />
            <Link href="/finances/accounts" className="lf-sb-link text-sm text-text-2 hover:text-text">
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
    ...forecast.warnings.map((w) => ({ tone: "danger" as const, text: w, fix: null as string | null, href: "/finances/bills", label: "Review" })),
    ...warnings
      .filter((w) => w.status !== "on_track")
      .map((w) => ({
        tone: w.status === "over" ? ("danger" as const) : ("warning" as const),
        text:
          w.status === "over"
            ? `${w.categoryName} is over budget: ${whole(w.spentCents)} of ${whole(w.limitCents)}.`
            : `${w.categoryName} is on pace for ${whole(w.projectedCents)}, over its ${whole(w.limitCents)} budget.`,
        fix: w.fix,
        label: "Make a plan",
        // no Budget page (owner, 2026-11-10): the skyling helps with it, the question already in the box
        href: `/jarvis?ask=${encodeURIComponent(`Help me keep ${w.categoryName} under its ${whole(w.limitCents)} budget this month.`)}`,
      })),
  ].slice(0, 4);
  // Early in a month there's little to show yet: show last month instead.
  const early = Number(d.today.slice(8)) <= 7 || !d.categories.some((c) => c.cents > 0);
  const shown = (early ? d.lastCategories : d.categories).filter((c) => c.cents > 0).slice(0, 5);
  const lastByName = new Map(d.lastCategories.map((c) => [c.name, c.cents]));
  const maxCat = Math.max(1, ...shown.map((c) => c.cents));
  const lastShort = d.lastLabel.slice(0, 3);
  const asOf = o.balances.asOf ? formatIn(o.balances.asOf, d.tz, "MMM d, h:mm a") : null;

  const nextBill = [...d.forecast.bills].sort((a, b) => a.date.localeCompare(b.date))[0];
  const billDay = (date: string) => (date === d.today ? "today" : date === addDaysStr(d.today, 1) ? "tomorrow" : formatDateStr(date, "EEEE"));
  const places: { href: string; icon: "bill" | "calendar" | "card" | "money"; label: string; detail: string }[] = [
    { href: "/finances/transactions", icon: "bill", label: "Activity", detail: `${formatCents(o.month.netSpendingCents, { compact: true })} spent this month` },
    {
      href: "/finances/bills",
      icon: "calendar",
      label: "Bills and subscriptions",
      detail: nextBill ? `${nextBill.name} ${billDay(nextBill.date)}` : "Nothing due in the next 30 days",
    },
    {
      href: "/finances/accounts",
      icon: "card",
      label: "Accounts and savings",
      detail: `${o.accountCount} account${o.accountCount === 1 ? "" : "s"}`,
    },
    // investments get their own row only when there are some
    ...(o.investments
      ? [{ href: "/wealth", icon: "money" as const, label: "Investments", detail: `${formatCents(o.investments.valueCents, { compact: true })} invested` }]
      : []),
  ];
  return (
    // a laptop gets two columns (A-to-Z audit C2): what you have and what needs you on the left, the month ahead and
    // where it went on the right; a phone keeps one column in the same order
    <div className="mx-auto flex max-w-[640px] flex-col gap-9 lg:grid lg:max-w-[1040px] lg:grid-cols-2 lg:items-start lg:gap-x-10">
      <div className="contents lg:flex lg:flex-col lg:gap-9">
        <header className="animate-rise max-lg:order-[-3]">
          <p className="text-sm text-muted">{formatDateStr(d.today, "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-[2.5rem] leading-none font-medium tracking-tight">Money</h1>
          <p className="mt-2 text-xs text-muted">
            Balances as of {asOf ?? "unknown"}
            {o.balances.hasDemoData ? " · Sample data" : ""}
          </p>
        </header>

        {/* Available now: money in checking and cash that can be spent today */}
        <section className="animate-rise max-lg:order-[-3]" style={{ animationDelay: "60ms" }} aria-label="Available now">
          <SkyWindow tz={d.tz} data-tilt className="rounded-[1.75rem]">
            <div className="relative min-h-[12.5rem] px-6 pt-6 pb-5">
              <p className="flex items-center gap-1.5 text-sm text-white/80">
                <Wallet className="h-3.5 w-3.5" /> Available now
              </p>
              <p className="lf-sw-num tabular mt-1 font-display text-[3.375rem] leading-none font-medium tracking-tight">
                <CountUp cents={o.balances.cashCents} />
              </p>
              <p className="mt-2 max-w-[62%] text-sm text-white/80">In checking and cash. Savings are under Accounts.</p>
              <SkylingOnCoins />
            </div>
            {o.balances.creditOwedCents > 0 && (
              // Cards: what's owed, and what checking would hold after paying them off.
              <Link
                href="/finances/accounts"
                className="lf-sw-glass flex min-h-11 items-center justify-between gap-3 border-t border-white/10 px-6 py-2.5 text-sm"
              >
                <span>
                  Cards owed <span className="tabular font-medium">{whole(o.balances.creditOwedCents)}</span>
                </span>
                <span className="opacity-85">
                  After paying: <span className="tabular font-medium">{whole(o.balances.cashCents - o.balances.creditOwedCents)}</span>
                </span>
              </Link>
            )}
            <div className="lf-sw-glass grid grid-cols-2 divide-x divide-white/12 border-t border-white/10">
              <Stat
                label={
                  <>
                    <ArrowUpRight className="h-3 w-3" /> Spent
                  </>
                }
                cents={m.netSpendingCents}
                sub={`${lastShort} ${whole(d.last.netSpendingCents)}`}
              />
              <Stat
                label={
                  <>
                    <ArrowDownLeft className="h-3 w-3" /> Came in
                  </>
                }
                cents={m.incomeCents}
                sub={`${lastShort} ${whole(d.last.incomeCents)}`}
              />
            </div>
            <p className="lf-sw-glass border-t border-white/10 px-6 py-2.5 text-xs text-white/75">
              Spent and came in cover {m.period.label} · {net >= 0 ? `${whole(net)} more came in than went out` : `${whole(-net)} more went out than came in`}
            </p>
          </SkyWindow>
        </section>

        {/* Money's other places as three plain rows, each with a line about how it stands (navigation concept A, owner
            2026-11-10), in place of a row of pills */}
        <nav aria-label="Money places" className="animate-rise max-lg:order-[-3]" style={{ animationDelay: "90ms" }}>
          <ul className="lf-tiles">
            {places.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="flex min-h-16 items-center gap-3.5 px-4 py-3 transition-transform active:scale-[0.98]">
                  <PixelIcon name={p.icon} className="h-8 w-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold">{p.label}</span>
                    <span className="block truncate text-[0.8125rem] text-muted">{p.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {alerts.length > 0 && (
          <section className="animate-rise max-lg:order-[-2]" style={{ animationDelay: "140ms" }} aria-label="Heads up">
            <h2 className="mb-3 font-display text-[1.3125rem] leading-none font-medium tracking-tight">Heads up</h2>
            <ul className="lf-tiles">
              {alerts.map((a, i) => (
                <li key={i} className="flex gap-3 px-4 py-3.5">
                  <span className={cn("lf-chip-night mt-0.5 h-9 w-9 shrink-0 rounded-[0.75rem]", a.tone === "danger" && "text-dawn-glow")}>
                    <AlertTriangle className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] leading-snug font-medium">{a.text}</p>
                    {a.fix && <p className="mt-0.5 text-[0.8125rem] leading-snug text-text-2">{a.fix}</p>}
                    <Link href={a.href} className="lf-sb-link -mb-2 text-[0.8125rem] font-semibold text-text">
                      {a.label} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-9 lg:pt-[7.5rem]">
        <section className="animate-rise" style={{ animationDelay: "180ms" }} aria-label="Next 30 days">
          <Title href="/finances/bills">Next 30 days</Title>
          <div data-tilt className="rounded-[1.75rem] bg-surface p-5 shadow-soft">
            <CashOutlook
              cashCents={o.balances.cashCents}
              bills={forecast.bills}
              dailySpendCents={forecast.typicalDailySpendCents}
              days={30}
              expectedPay={forecast.expectedPay}
            />
          </div>
        </section>

        {shown.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "220ms" }} aria-label="Where it went">
            <Title href="/finances/transactions">{early ? `Where it went in ${d.lastLabel}` : `Where it went, ${m.period.label}`}</Title>
            <ul data-tilt className="flex flex-col gap-4 rounded-[1.75rem] bg-surface p-5 shadow-soft">
              {shown.map((c) => (
                <li key={c.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.9375rem]">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="tabular shrink-0">
                      {whole(c.cents)}
                      {!early && lastByName.has(c.name) && (
                        <span className="ml-1.5 text-xs text-muted">
                          {lastShort} {whole(lastByName.get(c.name)!)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-[3px] bg-surface-2">
                    <div className="lf-grow h-2.5 rounded-[3px] bg-accent" style={{ width: `${(c.cents / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, cents, sub }: { label: React.ReactNode; cents: number; sub: string }) {
  return (
    <div className="p-4">
      <p className="flex items-center gap-1 text-xs opacity-75">{label}</p>
      <p className="tabular mt-1 text-lg font-medium">
        <CountUp cents={cents} />
      </p>
      <p className="tabular mt-0.5 text-xs opacity-70">{sub}</p>
    </div>
  );
}

/** Their skyling, standing on a little stack of coins in the corner of the sky (tap it and it hops). */
function SkylingOnCoins() {
  return (
    <div className="absolute right-5 bottom-0 flex flex-col items-center">
      <MySkyling className="relative z-10 -mb-1.5 h-16 w-16 cursor-pointer" />
      <PixelArt art={COINS} className="w-12" />
    </div>
  );
}

function Title({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[1.3125rem] leading-tight font-medium tracking-tight">{children}</h2>
      <Link href={href} className="-my-3 flex min-h-11 shrink-0 items-center gap-1 text-sm text-muted hover:text-text">
        See all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
