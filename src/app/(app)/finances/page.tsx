import type { Metadata } from "next";
import Link from "next/link";
import { Info, Wallet } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { Card, CardHeader, EmptyState, Money, PageHeader, Progress, SourceBadge, Stat } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, monthStart, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { monthlyCashflow } from "@/server/services/finance/cashflow";
import { spendingSummary } from "@/server/services/finance/insights";
import { budgetStatus, spendingByCategory, upcomingRecurring } from "@/server/services/finance/planning";
import { queryTransactions } from "@/server/services/finance/transactions";

export const metadata: Metadata = { title: "Finances" };

export default async function FinancesPage() {
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const from6 = monthStart(addDaysStr(monthStart(today), -155));
    const [accounts, month, history, byCat, budgets, bills, recent] = await series(
      () => listAccounts(s),
      () => spendingSummary(s, { from: monthStart(today), to: today }),
      () => queryTransactions(s, { from: from6, to: today, limit: 5000 }),
      () => spendingByCategory(s, monthStart(today), today),
      () => budgetStatus(s, today),
      () => upcomingRecurring(s, today, addDaysStr(today, 30)),
      () => queryTransactions(s, { limit: 8 }),
    );
    return { today, accounts, month, history, byCat, budgets, bills, recent };
  });

  if (!d.accounts.length) {
    return (
      <>
        <PageHeader title="Finances" description="Spending, income, budgets and bills — calculated from your own records." />
        <Card>
          <EmptyState icon={<Wallet />} title="Add your first account to get started" action={<Link href="/finances/accounts" className="text-sm font-medium text-accent hover:underline">Add an account →</Link>}>
            Enter accounts manually and import transactions from a CSV export. Bank sync through Plaid is the next integration milestone — nothing here is simulated.
          </EmptyState>
        </Card>
      </>
    );
  }

  const balances = summarizeBalances(d.accounts);
  const monthly = monthlyCashflow(d.history).map((m) => ({ month: m.month, label: formatDateStr(`${m.month}-01`, "MMM"), incomeCents: m.incomeCents, spendingCents: m.netSpendingCents }));
  const sources = Object.keys(balances.bySource);

  return (
    <>
      <PageHeader
        title="Finances"
        description={`${formatDateStr(monthStart(d.today), "MMMM d")} – ${formatDateStr(d.today, "MMMM d")}`}
        actions={
          <AskJarvisButton prompt="Summarize my financial situation and tell me what I should focus on." className="h-9 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium hover:border-border-strong">
            Ask Jarvis about my money
          </AskJarvisButton>
        }
      />
      {sources.includes("demo") && (
        <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Some balances below are sample (demo) data and are labelled as such.</p>
      )}

      <Card className="mb-5 grid grid-cols-2 gap-5 p-5 md:grid-cols-5">
        <Stat label="Cash on hand" value={<Money cents={balances.cashCents} />} sub="Checking, savings & cash" />
        <Stat label="Credit owed" value={<Money cents={balances.creditOwedCents} />} />
        <Stat label="Earned this month" value={<Money cents={d.month.incomeCents} />} />
        <Stat label="Spent this month" value={<Money cents={d.month.netSpendingCents} />} sub={d.month.refundsCents + d.month.reimbursementsCents ? <>after <Money cents={d.month.refundsCents + d.month.reimbursementsCents} /> refunds</> : undefined} />
        <Stat
          label="Net cash flow"
          value={<Money cents={d.month.netCashflowCents} signed className={d.month.netCashflowCents < 0 ? "text-danger" : undefined} />}
          sub={d.month.pendingCount ? `${d.month.pendingCount} pending included` : undefined}
        />
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Cash flow" subtitle="Income vs. net spending, last 6 months" />
          <div className="px-5 pb-5">{monthly.length ? <CashflowChart data={monthly} /> : <p className="text-sm text-muted">No transactions yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Where it went" subtitle="Net spending by category this month" action={<Link href="/finances/transactions" className="text-xs font-medium text-accent hover:underline">Transactions</Link>} />
          <div className="px-5 pb-5">{d.byCat.length ? <BarList items={d.byCat.slice(0, 7).map((c) => ({ name: c.name, cents: c.cents }))} /> : <p className="text-sm text-muted">No spending recorded this month.</p>}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Budgets" action={<Link href="/finances/budgets" className="text-xs font-medium text-accent hover:underline">Manage</Link>} />
          <div className="px-5 pb-5">
            {d.budgets.length === 0 ? (
              <p className="text-sm text-muted">No budgets for this month yet.</p>
            ) : (
              d.budgets.slice(0, 5).map((b) => (
                <div key={b.id} className="py-1.5">
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{b.categoryName}</span>
                    <span className={cn("tabular text-xs", b.remainingCents < 0 ? "text-danger" : "text-muted")}>
                      {b.remainingCents < 0 ? <>over by <Money cents={-b.remainingCents} /></> : <><Money cents={b.remainingCents} /> left</>}
                    </span>
                  </div>
                  <Progress value={b.percent} tone={b.percent >= 100 ? "danger" : b.percent >= 85 ? "warning" : "accent"} label={`${b.categoryName} budget`} />
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming bills" subtitle="Next 30 days" action={<Link href="/finances/bills" className="text-xs font-medium text-accent hover:underline">All</Link>} />
          <ul className="px-5 pb-4">
            {d.bills.length === 0 && <li className="text-sm text-muted">No tracked bills.</li>}
            {d.bills.slice(0, 6).map((b) => (
              <li key={`${b.id}${b.date}`} className="flex justify-between gap-3 py-1.5 text-sm">
                <span className="truncate">
                  {b.name} <span className="text-xs text-muted">· {formatDateStr(b.date, "MMM d")}</span>
                </span>
                <Money cents={b.amountCents} signed className={b.amountCents > 0 ? undefined : "text-text"} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Link href="/finances/transactions" className="text-xs font-medium text-accent hover:underline">All</Link>} />
          <ul className="px-5 pb-4">
            {d.recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{t.merchantName ?? t.description}</span>
                  <span className="block text-xs text-muted">
                    {formatDateStr(t.date, "MMM d")} · {t.categoryName ?? "Uncategorized"}
                    {t.pending ? " · pending" : ""}
                  </span>
                </span>
                <Money cents={t.amountCents} signed className={cn("shrink-0", t.kind === "transfer" && "text-muted")} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Spending = expenses minus refunds and reimbursements. Transfers between your own accounts and investment contributions are excluded from both income and spending. Data sources:{" "}
          {sources.map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </p>
      </div>
    </>
  );
}
