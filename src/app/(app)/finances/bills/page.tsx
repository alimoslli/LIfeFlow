import type { Metadata } from "next";
import { Pause, Play, Repeat, X } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState, Money, SourceBadge } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listRecurring, suggestRecurring, upcomingRecurring } from "@/server/services/finance/planning";
import { createRecurringAction, setRecurringStatusAction } from "../actions";

export const metadata: Metadata = { title: "Bills & subscriptions" };

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export default async function BillsPage() {
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const [items, upcoming, detected] = await series(
      () => listRecurring(s, { includeInactive: true }),
      () => upcomingRecurring(s, today, addDaysStr(today, 30)),
      () => suggestRecurring(s, today),
    );
    return { items, upcoming, detected, today };
  });
  const active = d.items.filter((i) => i.status === "active");
  const monthlyOut = active.filter((i) => i.amountCents < 0).reduce((s, i) => s - i.amountCents * PER_MONTH[i.frequency], 0);
  const monthlyIn = active.filter((i) => i.amountCents > 0).reduce((s, i) => s + i.amountCents * PER_MONTH[i.frequency], 0);

  return (
    <>
      <h1 className="mb-5 font-display text-[28px] font-medium tracking-tight">Bills &amp; subscriptions</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Recurring"
              subtitle={
                active.length ? (
                  <>
                    About <Money cents={Math.round(monthlyOut)} /> out and <Money cents={Math.round(monthlyIn)} /> in per month
                  </>
                ) : undefined
              }
            />
            {d.items.length === 0 ? (
              <EmptyState icon={<Repeat />} title="Nothing tracked yet">
                Add rent, phone, subscriptions and paychecks to see what&apos;s coming up and forecast your cash.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {d.items.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted">
                        {r.frequency} · {r.kind}
                        {r.nextDueDate ? ` · next ${formatDateStr(r.nextDueDate, "MMM d")}` : ""}
                      </p>
                    </div>
                    {r.status !== "active" && <Badge>{r.status}</Badge>}
                    {r.source !== "manual" && <SourceBadge source={r.source} />}
                    <Money cents={r.amountCents} signed className={r.amountCents < 0 ? "text-text" : undefined} />
                    {r.status === "active" ? (
                      <ActionButton action={setRecurringStatusAction.bind(null, r.id, "paused")} title="Pause" className="text-muted hover:text-text">
                        <Pause className="h-3.5 w-3.5" />
                      </ActionButton>
                    ) : (
                      <ActionButton action={setRecurringStatusAction.bind(null, r.id, "active")} title="Resume" className="text-muted hover:text-text">
                        <Play className="h-3.5 w-3.5" />
                      </ActionButton>
                    )}
                    {r.status !== "cancelled" && (
                      <ActionButton
                        action={setRecurringStatusAction.bind(null, r.id, "cancelled")}
                        title="Mark cancelled"
                        className="text-muted hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d.detected.length > 0 && (
            <Card>
              <CardHeader title="Detected in your transactions" subtitle="Regular charges we found that you aren't tracking yet" />
              <ul className="divide-y divide-border">
                {d.detected.slice(0, 8).map((c) => (
                  <li key={c.merchantKey} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="text-xs text-muted">
                        {c.frequency} · {c.occurrences} times · last {formatDateStr(c.lastDate, "MMM d")} · {Math.round(c.confidence * 100)}% confident
                      </p>
                    </div>
                    <Money cents={c.averageAmountCents} signed className="text-text" />
                    <ActionForm action={createRecurringAction} className="contents">
                      <input type="hidden" name="name" value={c.name} />
                      <input type="hidden" name="amount" value={(Math.abs(c.averageAmountCents) / 100).toFixed(2)} />
                      <input type="hidden" name="frequency" value={c.frequency} />
                      <input type="hidden" name="nextDueDate" value={c.nextExpectedDate} />
                      <input type="hidden" name="kind" value={c.averageAmountCents > 0 ? "income" : "subscription"} />
                      <input type="hidden" name="detected" value="1" />
                      <SubmitButton size="sm" variant="secondary">
                        Track
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Next 30 days" />
            <ul className="px-5 pb-4">
              {d.upcoming.length === 0 && <li className="text-sm text-muted">Nothing scheduled.</li>}
              {d.upcoming.map((u) => (
                <li key={`${u.id}${u.date}`} className="flex justify-between py-1.5 text-sm">
                  <span className="truncate">
                    <span className="tabular mr-2 text-xs text-muted">{formatDateStr(u.date, "MMM d")}</span>
                    {u.name}
                  </span>
                  <Money cents={u.amountCents} signed className={u.amountCents < 0 ? "text-text" : undefined} />
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">Add recurring item</h2>
            <ActionForm action={createRecurringAction}>
              <Field label="Name" htmlFor="r-name">
                <Input id="r-name" name="name" required placeholder="Spotify" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount ($)" htmlFor="r-amt">
                  <Input id="r-amt" name="amount" inputMode="decimal" required placeholder="11.99" />
                </Field>
                <Field label="Type" htmlFor="r-kind">
                  <Select id="r-kind" name="kind" defaultValue="subscription">
                    <option value="bill">Bill</option>
                    <option value="subscription">Subscription</option>
                    <option value="income">Income</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Repeats" htmlFor="r-freq">
                  <Select id="r-freq" name="frequency" defaultValue="monthly">
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </Field>
                <Field label="Next due" htmlFor="r-next">
                  <Input id="r-next" name="nextDueDate" type="date" defaultValue={d.today} />
                </Field>
              </div>
              <SubmitButton className="self-end">Add</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
