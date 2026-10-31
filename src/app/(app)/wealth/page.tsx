import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { BarList } from "@/components/charts/bar-list";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, Money, PageHeader, SourceBadge, Stat } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { listGoals } from "@/server/services/finance/planning";
import { allocation, listHoldings } from "@/server/services/finance/wealth";
import { GENERAL_INFO, investmentReport, LESSONS } from "@/server/services/finance/investing";
import { GrowthCalculator } from "./growth-calculator";
import { addHoldingAction, deleteHoldingAction } from "./actions";

export const metadata: Metadata = { title: "Wealth" };

const TYPE: Record<string, string> = {
  equity: "Stocks",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  crypto: "Crypto",
  bond: "Bonds",
  cash: "Cash",
  other: "Other",
};

export default async function WealthPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => {
    const [accounts, holdings, goals, report] = await series(
      () => listAccounts(s),
      () => listHoldings(s),
      () => listGoals(s),
      () => investmentReport(s),
    );
    return { accounts, holdings, goals: goals.filter((g) => g.kind === "investment"), report, tz: u.timezone, level: u.preferences?.moneyLevel ?? "new" };
  });
  const totals = summarizeBalances(d.accounts);
  const investments = d.accounts.filter((a) => a.type === "investment");
  const isRetirement = (sub: string | null) => !!sub && /ira|401|403|roth|retire|pension/i.test(sub);
  const retirementCents = investments.filter((a) => isRetirement(a.subtype)).reduce((s, a) => s + a.currentBalanceCents, 0);
  const alloc = allocation(d.holdings);
  const holdingsTotal = d.holdings.reduce((s, h) => s + h.valueCents, 0);

  return (
    <>
      <PageHeader title="Investments" description="Investments and net worth." />
      <Card className="mb-5 grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
        <Stat label="Net worth" value={<Money cents={totals.netWorthCents} />} sub="Assets minus debts" />
        <Stat
          label="Investments"
          value={<Money cents={totals.investmentsCents} />}
          sub={`${investments.length} account${investments.length === 1 ? "" : "s"}`}
        />
        <Stat label="Retirement" value={<Money cents={retirementCents} />} sub="IRA / 401(k) subtypes" />
        <Stat label="Debts" value={<Money cents={totals.creditOwedCents + totals.loansOwedCents} />} sub="Cards and loans" />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Investment accounts"
              action={
                <Link href="/finances/accounts" className="-my-3 flex min-h-11 items-center text-xs font-medium text-accent hover:underline">
                  Manage accounts
                </Link>
              }
            />
            {investments.length === 0 ? (
              <EmptyState icon={<LineChart />} title="No investment accounts">
                Add brokerage, Roth IRA or crypto accounts on the Accounts page (type “Investment”). Synced balances and holdings will need Plaid Investments
                access.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {investments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {[a.institutionName, a.subtype].filter(Boolean).join(" · ")} · as of {formatIn(a.balanceUpdatedAt, d.tz, "MMM d")}{" "}
                        <SourceBadge source={a.source} />
                      </p>
                    </div>
                    <Money cents={a.currentBalanceCents} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Holdings"
              subtitle={
                d.holdings.length ? (
                  <>
                    Holdings total <Money cents={holdingsTotal} />
                    {holdingsTotal !== totals.investmentsCents && (
                      <>
                        {" "}
                        · account balances total <Money cents={totals.investmentsCents} />, the difference is cash or positions not listed here
                      </>
                    )}
                  </>
                ) : undefined
              }
            />
            {d.holdings.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">
                No holdings recorded. Add positions manually below; balances above don&apos;t imply holdings data is available.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-border text-left text-xs text-muted">
                      <th className="px-5 py-2 font-medium">Holding</th>
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium">Quantity</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                      <th className="px-3 py-2 text-right font-medium">Gain</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {d.holdings.map((h) => (
                      <tr key={h.id} className="border-b border-border/70">
                        <td className="px-5 py-2">
                          <span className="font-medium">{h.symbol ?? h.name}</span>
                          {h.symbol && <span className="block text-xs text-muted">{h.name}</span>}
                        </td>
                        <td className="px-3 py-2 text-muted">{d.accounts.find((a) => a.id === h.accountId)?.name}</td>
                        <td className="px-3 py-2 text-right">{Number(h.quantity).toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                        <td className="px-3 py-2 text-right">
                          <Money cents={h.valueCents} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {h.costBasisCents != null ? (
                            <Money cents={h.valueCents - h.costBasisCents} signed className={h.valueCents < h.costBasisCents ? "text-danger" : undefined} />
                          ) : (
                            <span className="text-muted">n/a</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {h.source === "manual" && (
                            <ActionButton
                              action={deleteHoldingAction.bind(null, h.id)}
                              confirm="Remove this holding?"
                              title="Remove holding"
                              className="text-muted hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          {(d.report.notes.length > 0 || d.report.yearlyFeesCents != null) && (
            <Card className="p-5">
              <h2 className="mb-2 text-[15px] font-semibold">What stands out</h2>
              <ul className="flex flex-col gap-2 text-sm text-text-2">
                {d.report.yearlyFeesCents != null && (
                  <li>
                    Fund fees cost about <Money cents={d.report.yearlyFeesCents} /> a year
                    {d.report.averageFeePercent != null ? ` (average ${d.report.averageFeePercent.toFixed(2)}%)` : ""}.
                  </li>
                )}
                {d.report.topHoldingSharePercent != null && <li>Your largest holding is {d.report.topHoldingSharePercent}% of what you hold.</li>}
                {d.report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold">What if I invest every month?</h2>
            <GrowthCalculator startCents={totals.investmentsCents} />
          </Card>
          {alloc.length > 0 && (
            <Card>
              <CardHeader title="Allocation" subtitle="By holding type" />
              <div className="px-5 pb-5">
                <BarList items={alloc.map((a) => ({ name: TYPE[a.type] ?? a.type, cents: a.cents }))} />
              </div>
            </Card>
          )}
          {investments.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">Add a holding</h2>
              <ActionForm action={addHoldingAction} showSuccess>
                <Field label="Account" htmlFor="h-acct">
                  <Select id="h-acct" name="accountId" required>
                    {investments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <Field label="Name" htmlFor="h-name">
                    <Input id="h-name" name="name" required placeholder="Vanguard Total Stock Market ETF" />
                  </Field>
                  <Field label="Symbol" htmlFor="h-sym">
                    <Input id="h-sym" name="symbol" placeholder="VTI" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="h-type">
                    <Select id="h-type" name="securityType" defaultValue="etf">
                      {Object.entries(TYPE).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantity" htmlFor="h-q">
                    <Input id="h-q" name="quantity" inputMode="decimal" required />
                  </Field>
                  <Field label="Current value ($)" htmlFor="h-v">
                    <Input id="h-v" name="value" inputMode="decimal" required />
                  </Field>
                  <Field label="Cost basis ($)" htmlFor="h-c">
                    <Input id="h-c" name="costBasis" inputMode="decimal" />
                  </Field>
                  <Field label="Fund fee (expense ratio %)" htmlFor="h-er" hint="Optional, e.g. 0.03">
                    <Input id="h-er" name="expenseRatio" inputMode="decimal" />
                  </Field>
                </div>
                <SubmitButton className="self-end">Add holding</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card className="p-5 text-sm text-text-2">
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide uppercase">Synced investments</h2>
            Connect your brokerage, Roth IRA or crypto account on the{" "}
            <Link href="/finances/accounts" className="text-accent">
              Accounts
            </Link>{" "}
            page. Balances and holdings then sync daily and are marked &quot;Synced&quot;. Some brokerages share balances only.
          </Card>
        </div>
      </div>
      <Card className="mt-5 p-5">
        <h2 className="mb-3 text-[15px] font-semibold">Investing basics</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.filter((l) => ["compounding", "index_funds", "risk", "roth_ira", "fees", "emergency_first"].includes(l.id)).map((l) => (
            <li key={l.id}>
              <details className="rounded-2xl bg-surface-2/70 p-4 text-sm" open={d.level === "new" && l.id === "compounding"}>
                <summary className="cursor-pointer font-medium">{l.title}</summary>
                <p className="mt-2 text-text-2">{l.body}</p>
              </details>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{GENERAL_INFO} LifeFlow never trades or moves money.</p>
      </Card>
    </>
  );
}
