import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Landmark, TrendingDown, TrendingUp } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { Pressable } from "@/components/motion/pressable";
import { InsightList } from "../_today/insights";
import { addDaysStr, formatDateStr, monthStart, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { getBriefing } from "@/server/briefing";
import { deriveInsights } from "@/server/briefing/rules";
import { series } from "@/server/db/series";
import { listAccounts } from "@/server/services/finance/accounts";
import { spendingByCategory, upcomingRecurring } from "@/server/services/finance/planning";

export const metadata: Metadata = { title: "Money" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function MoneyPage() {
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const { snapshot } = await getBriefing(s, u);
    const [accounts, categories, bills] = await series(
      () => listAccounts(s),
      () => spendingByCategory(s, monthStart(today), today),
      () => upcomingRecurring(s, today, addDaysStr(today, 30)),
    );
    return { snapshot, accounts, categories, bills: bills.filter((b) => b.amountCents < 0), today };
  });
  const m = d.snapshot.money;

  if (!m) {
    return (
      <div className="mx-auto max-w-[640px]">
        <h1 className="font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
        <div className="mt-8 rounded-3xl bg-surface p-8 text-center shadow-soft">
          <Landmark className="mx-auto h-7 w-7 text-accent" />
          <p className="mt-3 text-[17px]">Add an account to see where you stand.</p>
          <p className="mt-1 text-sm text-muted">Enter balances yourself or import a bank CSV. Automatic bank sync is coming.</p>
          <Link href="/finances/accounts" className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-text">
            Add an account
          </Link>
        </div>
      </div>
    );
  }

  const month = formatDateStr(d.today, "MMMM");
  const net = m.incomeThisMonthCents - m.spentThisMonthCents;
  const insights = deriveInsights(d.snapshot, 10)
    .filter((i) => ["money", "trend", "goal"].includes(i.icon))
    .slice(0, 3);
  const topCats = d.categories.filter((c) => c.cents > 0).slice(0, 5);
  const maxCat = Math.max(1, ...topCats.map((c) => c.cents));
  const investmentAccounts = d.accounts.filter((a) => a.type === "investment");
  const ret = m.investments?.returnPct ?? null;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-10 lg:max-w-none lg:flex-row lg:items-start lg:gap-8">
      {/* Phones: one column in the original order (max-lg:order). Wide screens: a main and a side column. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-[1.4] lg:flex-col lg:gap-10">
        <header className="animate-rise max-lg:order-[-2]">
          <p className="text-sm text-muted">{month}</p>
          <h1 className="mt-1 font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
          {m.hasDemoData && <p className="mt-2 text-xs text-muted">Sample data</p>}
        </header>
        {/* The three numbers that matter */}
        <section className="animate-rise max-lg:order-[-2]" style={{ animationDelay: "60ms" }} aria-label="This month">
          <div data-tilt className="lf-sheen relative overflow-hidden rounded-[28px] bg-hero text-hero-text shadow-lift">
            <div className="relative p-6 pb-5">
              <Waves />
              <p className="relative text-sm opacity-75">Cash &amp; checking</p>
              <p className="tabular relative mt-1 font-display text-[54px] leading-none font-medium tracking-tight">
                <CountUp cents={m.liquidCents} />
              </p>
              <p className="relative mt-2 text-sm opacity-75">
                {net >= 0 ? `${whole(net)} more came in than went out this month` : `${whole(-net)} more went out than came in this month`}
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/15 border-t border-white/15">
              <div className="p-5">
                <p className="flex items-center gap-1.5 text-sm opacity-75">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Spent
                </p>
                <p className="tabular mt-1 text-2xl font-medium">
                  <CountUp cents={m.spentThisMonthCents} />
                </p>
              </div>
              <div className="p-5">
                <p className="flex items-center gap-1.5 text-sm opacity-75">
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Came in
                </p>
                <p className="tabular mt-1 text-2xl font-medium">
                  <CountUp cents={m.incomeThisMonthCents} />
                </p>
              </div>
            </div>
          </div>
        </section>
        {topCats.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "200ms" }} aria-label="Where it went">
            <Title href="/finances/transactions">Where it went in {month}</Title>
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
          <section className="animate-rise" style={{ animationDelay: "240ms" }} aria-label="Bills">
            <Title href="/finances/bills">Bills in the next 30 days</Title>
            <ul data-tilt className="flex flex-col divide-y divide-border rounded-3xl bg-surface px-5 shadow-soft">
              {d.bills.slice(0, 6).map((c) => (
                <li key={`${c.id}${c.date}`} className="flex items-center gap-4 py-3.5">
                  <span className="tabular w-14 shrink-0 text-sm text-muted">{formatDateStr(c.date, "MMM d")}</span>
                  <span className="flex-1 truncate text-[15px]">{c.name}</span>
                  <span className="tabular text-[15px]">{whole(-c.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-10 lg:pt-[72px]">
        {m.investments && (
          <section className="animate-rise max-lg:order-[-1]" style={{ animationDelay: "120ms" }} aria-label="Investments">
            <Title href="/wealth">Investments</Title>
            <Pressable>
              <Link data-tilt href="/wealth" className="block rounded-3xl bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted">Portfolio</p>
                    <p className="tabular mt-1 font-display text-[34px] leading-none font-medium">
                      <CountUp cents={m.investments.valueCents} />
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
                {ret != null && <p className="mt-2 text-xs text-muted">All-time return on holdings with a known cost</p>}
                <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                  {investmentAccounts.map((a) => (
                    <li key={a.id} className="flex justify-between text-[15px]">
                      <span className="text-text-2">{a.name}</span>
                      <span className="tabular">{whole(a.currentBalanceCents)}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            </Pressable>
          </section>
        )}
        {insights.length > 0 && (
          <section className="max-lg:order-[-1]" aria-label="Worth knowing">
            <h2 className="mb-3 text-[15px] font-semibold">Worth knowing</h2>
            <InsightList insights={insights} />
          </section>
        )}
        <section className="grid grid-cols-2 gap-3" aria-label="Savings and debt">
          <div data-tilt className="rounded-3xl bg-surface p-5 shadow-soft">
            <p className="text-sm text-muted">Savings</p>
            <p className="tabular mt-1 text-xl font-medium">{whole(m.savingsCents)}</p>
          </div>
          <div data-tilt className="rounded-3xl bg-surface p-5 shadow-soft">
            <p className="text-sm text-muted">Owed on cards</p>
            <p className="tabular mt-1 text-xl font-medium">{whole(m.creditOwedCents)}</p>
          </div>
        </section>
      </div>
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
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      <Link href={href} className="flex items-center gap-1 text-sm text-muted hover:text-text">
        See all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
