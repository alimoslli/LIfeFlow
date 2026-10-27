import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, Landmark, LineChart, PiggyBank, Receipt, Repeat, Target } from "lucide-react";
import { InsightList } from "../_today/insights";
import { addDaysStr, formatDateStr, monthStart, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { getBriefing } from "@/server/briefing";
import { deriveInsights } from "@/server/briefing/rules";
import { series } from "@/server/db/series";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { spendingByCategory, upcomingRecurring } from "@/server/services/finance/planning";

export const metadata: Metadata = { title: "Money" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");

export default async function MoneyPage() {
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const { snapshot, briefing } = await getBriefing(s, u);
    const [accounts, categories, coming] = await series(
      () => listAccounts(s),
      () => spendingByCategory(s, monthStart(today), today),
      () => upcomingRecurring(s, today, addDaysStr(today, 21)),
    );
    return { snapshot, briefing, accounts, categories, coming, today };
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

  const sts = d.briefing.safeToSpend!;
  const balances = summarizeBalances(d.accounts);
  const insights = deriveInsights(d.snapshot, 10).filter((i) => ["money", "trend", "goal"].includes(i.icon)).slice(0, 3);
  const diff = m.monthToDateSpendCents - m.lastMonthSameSpanSpendCents;
  const pct = m.lastMonthSameSpanSpendCents ? Math.round((diff / m.lastMonthSameSpanSpendCents) * 100) : null;
  const topCats = d.categories.filter((c) => c.cents > 0).slice(0, 5);
  const maxCat = Math.max(1, ...topCats.map((c) => c.cents));

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-10">
      <header className="animate-rise">
        <h1 className="font-display text-[40px] leading-none font-medium tracking-tight">Money</h1>
        {m.hasDemoData && <p className="mt-2 text-xs text-muted">Sample data</p>}
      </header>

      <section className="animate-rise rounded-3xl bg-accent p-6 text-accent-text shadow-lift" style={{ animationDelay: "60ms" }}>
        <p className="text-sm opacity-75">{sts.amountCents >= 0 ? "Free to spend this month" : "Short this month"}</p>
        <p className="mt-1 font-display text-[52px] leading-none font-medium tracking-tight">{whole(Math.abs(sts.amountCents))}</p>
        <p className="mt-2 text-sm opacity-80">{sts.amountCents >= 0 ? `about ${whole(sts.perDayCents)} a day after bills` : "bills are ahead of your cash"}</p>
        <p className="mt-4 flex items-start gap-1.5 border-t border-white/15 pt-3 text-xs opacity-70">
          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {sts.explanation}
        </p>
      </section>

      <section className="animate-rise" style={{ animationDelay: "120ms" }}>
        <p className="text-[17px] leading-relaxed text-text-2">
          You&apos;ve spent <span className="font-medium text-text">{whole(m.monthToDateSpendCents)}</span> so far in {formatDateStr(d.today, "MMMM")}
          {pct != null && Math.abs(pct) >= 5 ? (
            <>
              {" "}— <span className={cn("font-medium", pct > 0 ? "text-danger" : "text-success")}>{Math.abs(pct)}% {pct > 0 ? "more" : "less"}</span> than this point last month.
            </>
          ) : (
            ", about the same as last month."
          )}
        </p>
      </section>

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Worth knowing</h2>
          <InsightList insights={insights} />
        </section>
      )}

      {topCats.length > 0 && (
        <section className="animate-rise" style={{ animationDelay: "200ms" }}>
          <Title href="/finances/transactions">Where it went this month</Title>
          <ul className="flex flex-col gap-3.5 rounded-3xl bg-surface p-5 shadow-soft">
            {topCats.map((c) => (
              <li key={c.name}>
                <div className="mb-1.5 flex justify-between text-[15px]">
                  <span>{c.name}</span>
                  <span className="tabular text-text-2">{whole(c.cents)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(c.cents / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.coming.length > 0 && (
        <section className="animate-rise" style={{ animationDelay: "240ms" }}>
          <Title href="/finances/bills">Coming up</Title>
          <ul className="flex flex-col">
            {d.coming.slice(0, 6).map((c) => (
              <li key={`${c.id}${c.date}`} className="flex items-center gap-4 py-2.5">
                <span className="tabular w-14 shrink-0 text-sm text-muted">{formatDateStr(c.date, "MMM d")}</span>
                <span className="flex-1 truncate text-[15px]">{c.name}</span>
                <span className={cn("tabular text-[15px]", c.amountCents > 0 ? "text-success" : "text-text")}>
                  {c.amountCents > 0 ? "+" : "−"}
                  {whole(Math.abs(c.amountCents))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="animate-rise" style={{ animationDelay: "280ms" }}>
        <Title href="/wealth">Everything you have</Title>
        <div className="rounded-3xl bg-surface p-5 shadow-soft">
          <p className="text-sm text-muted">Net worth</p>
          <p className="mt-1 font-display text-[32px] leading-none font-medium">{whole(balances.netWorthCents)}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <Mini label="Cash" value={whole(balances.cashCents)} />
            <Mini label="Investments" value={whole(balances.investmentsCents)} />
            <Mini label="Owed" value={whole(balances.creditOwedCents + balances.loansOwedCents)} />
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="mb-3 text-sm text-muted">Details</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Place href="/finances/transactions" icon={<Receipt />} label="Transactions" />
          <Place href="/finances/budgets" icon={<Target />} label="Budgets" />
          <Place href="/finances/bills" icon={<Repeat />} label="Bills" />
          <Place href="/finances/goals" icon={<PiggyBank />} label="Goals" />
          <Place href="/finances/accounts" icon={<Landmark />} label="Accounts" />
          <Place href="/wealth" icon={<LineChart />} label="Investments" />
        </div>
      </section>
    </div>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function Place({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-2xl bg-surface p-3.5 text-sm font-medium shadow-soft transition-shadow hover:shadow-lift [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-accent">
      {icon}
      {label}
    </Link>
  );
}
