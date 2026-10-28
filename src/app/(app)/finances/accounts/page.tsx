import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import { Archive, Landmark } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState, Money, SourceBadge } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { BankConnections } from "@/components/finance/bank-connections";
import { listPlaidConnections, plaidConfig } from "@/server/integrations/plaid";
import { archiveAccountAction, createAccountAction, disconnectBankAction, updateAccountDetailsAction } from "../actions";

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
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => ({ accounts: await listAccounts(s), banks: await listPlaidConnections(s), tz: u.timezone }));
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
                Connect your bank to import accounts automatically, or add checking, savings, cards and investments yourself.
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
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-accent">Edit details</summary>
                      <ActionForm action={updateAccountDetailsAction.bind(null, a.id)} reset={false} showSuccess className="mt-3 gap-3">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {(a.source === "manual" || a.source === "demo") && (
                            <Field label={a.type === "credit" || a.type === "loan" ? "Amount owed ($)" : "Balance ($)"} htmlFor={`bal-${a.id}`}>
                              <Input id={`bal-${a.id}`} name="balance" inputMode="decimal" defaultValue={(a.currentBalanceCents / 100).toFixed(2)} required />
                            </Field>
                          )}
                          {(a.type === "credit" || a.type === "loan") && (
                            <>
                              {a.type === "credit" && (
                                <Field label="Credit limit ($)" htmlFor={`lim-${a.id}`}>
                                  <Input
                                    id={`lim-${a.id}`}
                                    name="limit"
                                    inputMode="decimal"
                                    defaultValue={a.creditLimitCents != null ? (a.creditLimitCents / 100).toFixed(0) : ""}
                                  />
                                </Field>
                              )}
                              <Field label="Interest rate (APR %)" htmlFor={`apr-${a.id}`}>
                                <Input
                                  id={`apr-${a.id}`}
                                  name="apr"
                                  inputMode="decimal"
                                  defaultValue={a.aprBps != null ? String(a.aprBps / 100) : ""}
                                  placeholder="24.99"
                                />
                              </Field>
                              <Field label="Minimum payment ($)" htmlFor={`min-${a.id}`}>
                                <Input
                                  id={`min-${a.id}`}
                                  name="minPayment"
                                  inputMode="decimal"
                                  defaultValue={a.minPaymentCents != null ? (a.minPaymentCents / 100).toFixed(2) : ""}
                                />
                              </Field>
                              <Field label="Next due date" htmlFor={`due-${a.id}`}>
                                <Input id={`due-${a.id}`} name="dueDate" type="date" defaultValue={a.nextPaymentDueDate ?? ""} />
                              </Field>
                            </>
                          )}
                        </div>
                        <SubmitButton size="sm" className="self-end">
                          Save
                        </SubmitButton>
                      </ActionForm>
                      <div className="mt-2">
                        <ActionButton
                          action={archiveAccountAction.bind(null, a.id)}
                          confirm={`Archive ${a.name}? Its transactions are kept.`}
                          title={`Archive ${a.name}`}
                          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted hover:text-text"
                        >
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </ActionButton>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-1 text-[15px] font-semibold">Bank connections</h2>
            <p className="mb-4 text-sm text-text-2">
              Balances, transactions, investments and card details sync automatically every day, and whenever your bank has something new.
            </p>
            <BankConnections
              configured={!!plaidConfig()}
              disconnect={disconnectBankAction}
              connections={d.banks.map((b) => ({
                id: b.id,
                name: b.displayName ?? "Bank",
                status: b.status,
                lastSynced: b.lastSyncedAt ? formatIn(b.lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
                error: b.lastError,
              }))}
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">Add an account manually</h2>
            <ActionForm action={createAccountAction} showSuccess>
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
        </div>
      </div>
    </>
  );
}
