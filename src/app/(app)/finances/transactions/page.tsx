import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Download, Receipt, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge, Card, EmptyState, Money, SourceBadge } from "@/components/ui/surface";
import { formatDateStr, isValidDateStr, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAccounts } from "@/server/services/finance/accounts";
import { listCategories } from "@/server/services/finance/categories";
import { summarizeCashflow } from "@/server/services/finance/cashflow";
import { TRANSACTION_KINDS, queryTransactions } from "@/server/services/finance/transactions";
import { createTransactionAction, deleteTransactionAction, importCsvAction, updateTransactionAction } from "../actions";
import { AddTransactionDialog, CategoryOptions, ImportCsvDialog, KIND_LABELS } from "../forms";

export const metadata: Metadata = { title: "Transactions" };

type SP = { q?: string; from?: string; to?: string; category?: string; kind?: string; account?: string; edit?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const [accounts, categories] = await series(() => listAccounts(s), () => listCategories(s));
    const kind = TRANSACTION_KINDS.find((k) => k === sp.kind);
    const rows = await queryTransactions(s, {
      search: sp.q?.slice(0, 100),
      from: sp.from && isValidDateStr(sp.from) ? sp.from : undefined,
      to: sp.to && isValidDateStr(sp.to) ? sp.to : undefined,
      categoryIds: sp.category && categories.some((c) => c.id === sp.category) ? categories.filter((c) => c.id === sp.category || c.parentId === sp.category).map((c) => c.id) : undefined,
      kinds: kind ? [kind] : undefined,
      accountId: accounts.some((a) => a.id === sp.account) ? sp.account : undefined,
      includeExcluded: true,
      limit: 500,
    });
    return { accounts, categories, rows, today: todayIn(u.timezone) };
  });
  const summary = summarizeCashflow(d.rows);
  const filtered = Boolean(sp.q || sp.from || sp.to || sp.category || sp.kind || sp.account);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/finances/transactions?${p}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export?format=transactions.csv" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:border-border-strong">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
          {d.accounts.length > 0 && <ImportCsvDialog action={importCsvAction} accounts={d.accounts} />}
          {d.accounts.length > 0 && <AddTransactionDialog action={createTransactionAction} accounts={d.accounts} categories={d.categories} today={d.today} />}
        </div>
      </div>

      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_1.3fr_1fr_auto]" action="/finances/transactions">
        <Input name="q" defaultValue={sp.q} placeholder="Search description or merchant" aria-label="Search" className="col-span-2 md:col-span-1" />
        <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={sp.to} aria-label="To date" />
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {d.categories
            .filter((c) => !c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
        <Select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type">
          <option value="">All types</option>
          {TRANSACTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {filtered && (
            <Link href="/finances/transactions" className="inline-flex h-9 items-center px-2 text-sm text-muted hover:text-text">
              Clear
            </Link>
          )}
        </div>
      </form>

      {d.rows.length > 0 && (
        <p className="mb-3 text-xs text-muted">
          {d.rows.length} transaction{d.rows.length === 1 ? "" : "s"}
          {filtered ? " match" : ""} · income <Money cents={summary.incomeCents} /> · spending <Money cents={summary.netSpendingCents} />
          {summary.transfersOutCents ? <> · transfers <Money cents={summary.transfersOutCents} /> (excluded)</> : null}
          {summary.excludedCount ? ` · ${summary.excludedCount} hidden from totals` : ""}
        </p>
      )}

      <Card>
        {d.rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title={filtered ? "No transactions match these filters" : "No transactions yet"}>
            {d.accounts.length ? "Add one manually or import a CSV from your bank." : <Link href="/finances/accounts" className="text-accent hover:underline">Add an account first.</Link>}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((t) => (
                  <Fragment key={t.id}>
                    <tr className={cn("border-b border-border/70 hover:bg-surface-2/60", t.excluded && "opacity-50")}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatDateStr(t.date, "MMM d, yyyy")}</td>
                      <td className="max-w-72 px-4 py-2.5">
                        <Link href={sp.edit === t.id ? qs({ edit: undefined }) : qs({ edit: t.id })} className="block truncate hover:text-accent">
                          {t.merchantName ?? t.description}
                        </Link>
                        <span className="flex flex-wrap gap-1 pt-0.5">
                          {t.pending && <Badge tone="warning">Pending</Badge>}
                          {t.kind !== "expense" && t.kind !== "income" && <Badge tone={t.kind === "transfer" ? "neutral" : "info"}>{KIND_LABELS[t.kind]}</Badge>}
                          {t.source !== "manual" && <SourceBadge source={t.source} />}
                          {t.excluded && <Badge>Hidden from totals</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: t.categoryColor ?? "var(--border-strong)" }} />
                          {t.categoryName ?? <span className="text-muted">Uncategorized</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{t.accountName}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Money cents={t.amountCents} signed className={cn(t.amountCents < 0 && "text-text", t.kind === "transfer" && "text-muted")} />
                      </td>
                    </tr>
                    {sp.edit === t.id && (
                      <tr className="border-b border-border bg-surface-2/60">
                        <td colSpan={5} className="px-4 py-3">
                          <ActionForm action={updateTransactionAction.bind(null, t.id)} reset={false} className="flex-row flex-wrap items-end gap-2">
                            <label className="flex flex-col gap-1 text-xs text-text-2">
                              Type
                              <Select name="kind" defaultValue={t.kind} className="h-8 w-52 text-[13px]">
                                {TRANSACTION_KINDS.map((k) => (
                                  <option key={k} value={k}>
                                    {KIND_LABELS[k]}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-text-2">
                              Category
                              <Select name="categoryId" defaultValue={t.categoryId ?? ""} className="h-8 w-52 text-[13px]">
                                <CategoryOptions categories={d.categories} />
                              </Select>
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-text-2">
                              Note
                              <Input name="notes" defaultValue={t.notes ?? ""} className="h-8 w-56 text-[13px]" />
                            </label>
                            <label className="flex h-8 items-center gap-1.5 text-xs text-text-2">
                              <input type="checkbox" name="excluded" defaultChecked={t.excluded} className="accent-[var(--accent)]" /> Hide from totals
                            </label>
                            <SubmitButton size="sm">Save</SubmitButton>
                            {["manual", "import", "jarvis"].includes(t.source) && (
                              <ActionButton action={deleteTransactionAction.bind(null, t.id)} confirm="Delete this transaction?" title="Delete transaction" className="ml-auto flex h-8 items-center gap-1 rounded px-2 text-xs text-danger hover:bg-danger-soft">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </ActionButton>
                            )}
                          </ActionForm>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
