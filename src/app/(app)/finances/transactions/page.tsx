import type { Metadata } from "next";
import Link from "next/link";
import { Download, MoreHorizontal, Receipt, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Money, SourceBadge } from "@/components/ui/surface";
import { daysBetween, formatDateStr, isValidDateStr, todayIn } from "@/lib/dates";
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

type SP = { q?: string; from?: string; to?: string; category?: string; kind?: string; account?: string; edit?: string; show?: string };

const PAGE = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const [accounts, categories] = await series(
      () => listAccounts(s),
      () => listCategories(s),
    );
    const kind = TRANSACTION_KINDS.find((k) => k === sp.kind);
    const rows = await queryTransactions(s, {
      search: sp.q?.slice(0, 100),
      from: sp.from && isValidDateStr(sp.from) ? sp.from : undefined,
      to: sp.to && isValidDateStr(sp.to) ? sp.to : undefined,
      categoryIds:
        sp.category && categories.some((c) => c.id === sp.category)
          ? categories.filter((c) => c.id === sp.category || c.parentId === sp.category).map((c) => c.id)
          : undefined,
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

  const show = Math.min(d.rows.length, Math.max(PAGE, Number(sp.show) || PAGE));
  const groups = new Map<string, typeof d.rows>();
  for (const t of d.rows.slice(0, show)) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  const activeFilters = [sp.from, sp.to, sp.category, sp.kind, sp.account].filter(Boolean).length;

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">Transactions</h1>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full bg-surface shadow-soft [&::-webkit-details-marker]:hidden"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 flex w-52 flex-col gap-1 rounded-2xl bg-surface p-2 shadow-lift">
              {d.accounts.length > 0 && <ImportCsvDialog action={importCsvAction} accounts={d.accounts} />}
              <a href="/api/export?format=transactions.csv" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-surface-2">
                <Download className="h-4 w-4 text-muted" /> Export CSV
              </a>
            </div>
          </details>
          {d.accounts.length > 0 && <AddTransactionDialog action={createTransactionAction} accounts={d.accounts} categories={d.categories} today={d.today} />}
        </div>
      </div>

      <form className="mb-5 flex flex-col gap-2" action="/finances/transactions">
        <div className="flex items-center gap-2 rounded-full bg-surface p-1.5 pl-4 shadow-soft focus-within:shadow-lift">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search merchant or description"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] placeholder:text-muted focus:outline-none"
          />
          <Button type="submit" size="sm" className="h-9">
            Search
          </Button>
        </div>
        <details className="group px-1" open={activeFilters > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm text-muted [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeFilters ? ` · ${activeFilters}` : ""}
            {filtered && (
              <Link href="/finances/transactions" className="ml-auto text-accent">
                Clear
              </Link>
            )}
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          </div>
        </details>
      </form>

      {d.rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-surface p-4 shadow-soft">
            <p className="text-xs text-muted">Spent{filtered ? " (filtered)" : ""}</p>
            <Money cents={summary.netSpendingCents} className="mt-0.5 block text-lg font-medium" />
          </div>
          <div className="rounded-3xl bg-surface p-4 shadow-soft">
            <p className="text-xs text-muted">Came in</p>
            <Money cents={summary.incomeCents} className="mt-0.5 block text-lg font-medium text-success" />
          </div>
          <p className="col-span-2 px-1 text-xs text-muted">
            {d.rows.length} transactions · transfers between your accounts aren&apos;t counted
            {summary.excludedCount ? ` · ${summary.excludedCount} hidden` : ""}
          </p>
        </div>
      )}

      {d.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt />} title={filtered ? "No transactions match these filters" : "No transactions yet"}>
            {d.accounts.length ? (
              "Add one manually or import a CSV from your bank."
            ) : (
              <Link href="/finances/accounts" className="text-accent hover:underline">
                Add an account first.
              </Link>
            )}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([date, rows]) => (
            <section key={date}>
              <h2 className="mb-2 px-1 text-sm font-medium text-text-2">{dayHeading(date, d.today)}</h2>
              <Card>
                <ul className="divide-y divide-border/70">
                  {rows.map((t) => (
                    <li key={t.id} className={cn(t.excluded && "opacity-50")}>
                      <Link
                        href={sp.edit === t.id ? qs({ edit: undefined }) : qs({ edit: t.id })}
                        className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ background: t.categoryColor ?? "var(--muted)" }}
                        >
                          {(t.merchantName ?? t.description).trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{t.merchantName ?? t.description}</span>
                          <span className="block truncate text-xs text-muted">
                            {t.categoryName ?? "Uncategorized"}
                            {t.kind !== "expense" && t.kind !== "income" ? ` · ${KIND_LABELS[t.kind]}` : ""}
                            {t.pending ? " · Pending" : ""}
                            {t.excluded ? " · Hidden" : ""}
                          </span>
                        </span>
                        <span className="text-right">
                          <Money
                            cents={t.amountCents}
                            signed
                            className={cn("block text-[15px]", t.amountCents < 0 && "text-text", t.kind === "transfer" && "text-muted")}
                          />
                          <span className="block text-xs text-muted">{t.accountName}</span>
                        </span>
                      </Link>
                      {sp.edit === t.id && (
                        <div className="animate-fade-in bg-surface-2/60 px-4 py-4 sm:px-5">
                          <ActionForm action={updateTransactionAction.bind(null, t.id)} reset={false} className="gap-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-1 text-xs text-text-2">
                                Type
                                <Select name="kind" defaultValue={t.kind}>
                                  {TRANSACTION_KINDS.map((k) => (
                                    <option key={k} value={k}>
                                      {KIND_LABELS[k]}
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-text-2">
                                Category
                                <Select name="categoryId" defaultValue={t.categoryId ?? ""}>
                                  <CategoryOptions categories={d.categories} />
                                </Select>
                              </label>
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-text-2">
                              Note
                              <Input name="notes" defaultValue={t.notes ?? ""} />
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-1.5 text-sm text-text-2">
                                <input type="checkbox" name="excluded" defaultChecked={t.excluded} className="accent-[var(--accent)]" /> Hide from totals
                              </label>
                              {t.source !== "manual" && <SourceBadge source={t.source} />}
                              <span className="flex-1" />
                              {["manual", "import", "jarvis"].includes(t.source) && (
                                <ActionButton
                                  action={deleteTransactionAction.bind(null, t.id)}
                                  confirm="Delete this transaction?"
                                  title="Delete transaction"
                                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-danger hover:bg-danger-soft"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </ActionButton>
                              )}
                              <SubmitButton size="sm">Save</SubmitButton>
                            </div>
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {show < d.rows.length && (
            <Link
              href={qs({ show: String(show + PAGE) })}
              scroll={false}
              className="mx-auto rounded-full bg-surface px-5 py-2.5 text-sm font-medium shadow-soft"
            >
              Show more
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function dayHeading(date: string, today: string) {
  const diff = daysBetween(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDateStr(date, diff < 7 ? "EEEE" : "EEE, MMM d");
}
