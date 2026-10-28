import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Landmark } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState, Money, SourceBadge } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { providerCatalog } from "@/server/services/integrations";
import { archiveAccountAction, createAccountAction, updateBalanceAction } from "../actions";

export const metadata: Metadata = { title: "Accounts" };

const TYPE_LABEL: Record<string, string> = {
  depository: "Cash accounts",
  credit: "Credit cards",
  loan: "Loans",
  investment: "Investments",
  cash: "Cash",
  other: "Other",
};

export default async function AccountsPage() {
  const d = await withCurrentUser(async (s, u) => ({ accounts: await listAccounts(s), tz: u.timezone }));
  const plaid = providerCatalog().find((p) => p.provider === "plaid")!;
  const totals = summarizeBalances(d.accounts);
  const groups = Object.keys(TYPE_LABEL)
    .map((t) => ({ type: t, items: d.accounts.filter((a) => a.type === t) }))
    .filter((g) => g.items.length);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Accounts</h1>
        {d.accounts.length > 0 && (
          <p className="text-sm text-text-2">
            Net worth <Money cents={totals.netWorthCents} className="font-semibold text-text" />
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          {groups.length === 0 && (
            <Card>
              <EmptyState icon={<Landmark />} title="No accounts yet">
                Add your checking, savings, credit cards and investment accounts. Balances are entered by you until a bank connection is set up.
              </EmptyState>
            </Card>
          )}
          {groups.map((g) => (
            <Card key={g.type}>
              <CardHeader title={TYPE_LABEL[g.type]} />
              <ul className="divide-y divide-border">
                {g.items.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {a.name}
                        {a.mask && <span className="text-xs font-normal text-muted">••{a.mask}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {a.institutionName && <span>{a.institutionName} ·</span>}
                        <span>Balance as of {formatIn(a.balanceUpdatedAt, d.tz, "MMM d, h:mm a")}</span>
                        <SourceBadge source={a.source} />
                        {!a.includeInNetWorth && <Badge>Not in net worth</Badge>}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money cents={a.currentBalanceCents} className="font-semibold" />
                      {(a.type === "credit" || a.type === "loan") && <p className="text-[11px] text-muted">owed</p>}
                    </div>
                    {(a.source === "manual" || a.source === "demo") && (
                      <details className="w-full sm:w-auto">
                        <summary className="cursor-pointer text-xs text-accent">Update</summary>
                        <div className="mt-2 flex items-center gap-2">
                          <ActionForm action={updateBalanceAction.bind(null, a.id)} reset={false} className="flex-row gap-1.5">
                            <Input
                              name="balance"
                              inputMode="decimal"
                              defaultValue={(a.currentBalanceCents / 100).toFixed(2)}
                              className="h-8 w-28 text-[13px]"
                              aria-label="New balance"
                            />
                            <SubmitButton size="sm" variant="secondary">
                              Save
                            </SubmitButton>
                          </ActionForm>
                          <ActionButton
                            action={archiveAccountAction.bind(null, a.id)}
                            confirm={`Archive ${a.name}? Its transactions are kept.`}
                            title="Archive account"
                            className="p-1 text-muted hover:text-text"
                          >
                            <Archive className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">Add an account manually</h2>
            <ActionForm action={createAccountAction}>
              <Field label="Name" htmlFor="a-name">
                <Input id="a-name" name="name" required placeholder="Everyday Checking" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="a-type">
                  <Select id="a-type" name="type" defaultValue="depository">
                    <option value="depository">Checking / savings</option>
                    <option value="credit">Credit card</option>
                    <option value="investment">Investment / retirement</option>
                    <option value="loan">Loan</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Balance ($)" htmlFor="a-bal" hint="Amount owed for cards/loans">
                  <Input id="a-bal" name="balance" inputMode="decimal" required placeholder="1250.00" />
                </Field>
                <Field label="Institution" htmlFor="a-inst">
                  <Input id="a-inst" name="institutionName" placeholder="Chase" />
                </Field>
                <Field label="Last 4 digits" htmlFor="a-mask">
                  <Input id="a-mask" name="mask" inputMode="numeric" maxLength={4} />
                </Field>
              </div>
              <Field label="Subtype (optional)" htmlFor="a-sub" hint="e.g. Roth IRA, brokerage, crypto, savings">
                <Input id="a-sub" name="subtype" />
              </Field>
              <SubmitButton className="self-end">Add account</SubmitButton>
            </ActionForm>
          </Card>
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-wide text-text-2 uppercase">Bank connection</h2>
              <Badge>{plaid.configured ? "Configured · not built yet" : "Awaiting setup"}</Badge>
            </div>
            <p className="text-sm text-text-2">
              Automatic sync uses Plaid. It&apos;s the next integration milestone and needs Plaid API keys on the server. Investment holdings require
              Plaid&apos;s separate Investments product.
            </p>
            <Link href="/settings/integrations" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Integration status →
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
