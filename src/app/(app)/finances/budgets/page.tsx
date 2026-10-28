import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PieChart, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, Money, Progress } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, isValidDateStr, monthEnd, monthStart, todayIn } from "@/lib/dates";
import { resolvePeriod } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listCategories } from "@/server/services/finance/categories";
import { cashflowFor } from "@/server/services/finance/overview";
import { budgetStatus, spendingByCategory } from "@/server/services/finance/planning";
import { deleteBudgetAction, setBudgetAction } from "../actions";
import { CategoryOptions } from "../forms";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const month = monthStart(sp.month && isValidDateStr(`${sp.month}-01`) ? `${sp.month}-01` : today);
    const end = month === monthStart(today) ? today : monthEnd(month);
    const period = resolvePeriod("custom", today, { from: month, to: end });
    const [budgets, categories, spending, flow] = await series(
      () => budgetStatus(s, month),
      () => listCategories(s),
      () => spendingByCategory(s, month, monthEnd(month)),
      () => cashflowFor(s, period),
    );
    return { budgets, categories: categories.filter((c) => c.kind === "expense"), spending, month, today, flow };
  });
  const prev = monthStart(addDaysStr(d.month, -1)).slice(0, 7);
  const next = monthStart(addDaysStr(monthEnd(d.month), 1)).slice(0, 7);
  const totalLimit = d.budgets.reduce((a, b) => a + b.limitCents, 0);
  const totalSpent = d.budgets.reduce((a, b) => a + b.spentCents, 0);
  const isCurrent = d.month === monthStart(d.today);
  const budgeted = new Set(d.budgets.map((b) => b.categoryId));
  const unbudgeted = d.spending.filter((c) => c.id && !budgeted.has(c.id));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Budgets</h1>
        <div className="flex items-center rounded-full bg-surface shadow-soft">
          <Link href={`/finances/budgets?month=${prev}`} className="p-2 text-muted hover:text-text" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-32 px-3 py-2 text-center text-sm">{formatDateStr(d.month, "MMMM yyyy")}</span>
          <Link href={`/finances/budgets?month=${next}`} className="p-2 text-muted hover:text-text" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title={`${formatDateStr(d.month, "MMMM")} budgets`}
            subtitle={
              d.budgets.length ? (
                <>
                  {d.flow.period.label}: <Money cents={totalSpent} /> spent of <Money cents={totalLimit} /> budgeted
                </>
              ) : undefined
            }
          />
          {d.budgets.length > 0 && (
            <dl className="mx-5 mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2/70 p-3 text-xs">
              <div>
                <dt className="text-muted">In budgets</dt>
                <dd className="tabular mt-0.5 text-sm font-medium">
                  <Money cents={totalSpent} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">No budget</dt>
                <dd className="tabular mt-0.5 text-sm font-medium">
                  <Money cents={d.flow.netSpendingCents - totalSpent} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">All spending</dt>
                <dd className="tabular mt-0.5 text-sm font-medium">
                  <Money cents={d.flow.netSpendingCents} />
                </dd>
              </div>
              <p className="col-span-3 text-muted">In budgets plus no budget equals all spending, the same total Money shows for this range.</p>
            </dl>
          )}
          {d.budgets.length === 0 ? (
            <EmptyState icon={<PieChart />} title="No budgets this month">
              Set a monthly limit for a category. Budgets on a group (like Food &amp; Dining) include its subcategories.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {d.budgets.map((b) => (
                <li key={b.id} className="group px-5 py-3.5">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ background: b.color ?? "var(--accent)" }} />
                      {b.categoryName}
                    </span>
                    <span className="tabular text-sm">
                      <Money cents={b.spentCents} />{" "}
                      <span className="text-muted">
                        / <Money cents={b.limitCents} />
                      </span>
                    </span>
                  </div>
                  <Progress value={b.percent} tone={b.percent >= 100 ? "danger" : b.percent >= 85 ? "warning" : "accent"} label={`${b.categoryName} budget`} />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className={cn(b.remainingCents < 0 ? "text-danger" : "text-muted")}>
                      {b.remainingCents < 0 ? (
                        <>
                          Over by <Money cents={-b.remainingCents} />
                        </>
                      ) : (
                        <>
                          <Money cents={b.remainingCents} /> remaining
                        </>
                      )}{" "}
                      · {b.percent}%
                    </span>
                    <ActionButton
                      action={deleteBudgetAction.bind(null, b.id)}
                      title="Remove budget"
                      className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">Set a budget</h2>
            <ActionForm action={setBudgetAction}>
              <input type="hidden" name="month" value={d.month} />
              <Field label="Category" htmlFor="b-cat">
                <Select id="b-cat" name="categoryId" required>
                  <CategoryOptions categories={d.categories} />
                </Select>
              </Field>
              <Field label="Monthly limit ($)" htmlFor="b-lim" hint={isCurrent ? undefined : `Applies to ${formatDateStr(d.month, "MMMM yyyy")}.`}>
                <Input id="b-lim" name="limit" inputMode="decimal" required placeholder="300" />
              </Field>
              <SubmitButton className="self-end">Save budget</SubmitButton>
            </ActionForm>
          </Card>
          {unbudgeted.length > 0 && (
            <Card>
              <CardHeader title="Spending without a budget" />
              <ul className="px-5 pb-4">
                {unbudgeted.slice(0, 6).map((c) => (
                  <li key={c.name} className="flex justify-between py-1 text-sm">
                    <span>{c.name}</span>
                    <Money cents={c.cents} className="text-text-2" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
