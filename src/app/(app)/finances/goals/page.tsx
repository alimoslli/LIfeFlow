import { moneyGate } from "@/app/(app)/money-gate";
import type { Metadata } from "next";
import { Car, GraduationCap, Home, LineChart, Plane, PiggyBank, ShieldCheck, ShoppingBag, Sparkles, Trash2, Wallet } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Progress } from "@/components/ui/surface";
import { formatDateStr, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import type { GoalPurpose } from "@/server/db/schema";
import { listAccounts } from "@/server/services/finance/accounts";
import { goalsWithPlans } from "@/server/services/finance/goals";
import { AskJarvisButton } from "../../money/money-client";
import { archiveGoalAction, contributeGoalAction, createGoalAction, deleteGoalAction, updateGoalAction } from "../actions";
import { GoalTradeoff } from "./tradeoff";

export const metadata: Metadata = { title: "Goals" };

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");
const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

const PURPOSE: Record<GoalPurpose, { label: string; icon: typeof PiggyBank }> = {
  emergency: { label: "Emergency fund", icon: ShieldCheck },
  travel: { label: "Travel", icon: Plane },
  car: { label: "Car", icon: Car },
  home: { label: "Home or apartment", icon: Home },
  debt: { label: "Pay off debt", icon: Wallet },
  investing: { label: "Investing", icon: LineChart },
  education: { label: "Education", icon: GraduationCap },
  big_purchase: { label: "Big purchase", icon: ShoppingBag },
  other: { label: "Something else", icon: Sparkles },
};

export default async function GoalsPage() {
  const locked = await moneyGate();
  if (locked) return locked;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const [goals, accounts] = await series(
      () => goalsWithPlans(s, today),
      () => listAccounts(s, { types: ["depository", "investment", "cash"] }),
    );
    return { goals, accounts, today };
  });
  const active = d.goals.filter((g) => g.status === "active");
  const done = d.goals.filter((g) => g.status === "achieved");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-medium tracking-tight">Goals and dreams</h1>
        <AskJarvisButton prompt="Help me set a money goal. Ask me one question at a time about what I'm dreaming of, then create it.">
          <Sparkles className="h-3.5 w-3.5" /> Plan a goal with Jarvis
        </AskJarvisButton>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {d.goals.length === 0 && (
            <Card>
              <EmptyState icon={<PiggyBank />} title="What are you saving for?">
                An emergency fund, a trip, a car, an apartment, paying off a card. Give it a target and a date, and LifeFlow shows the monthly amount and when
                you&apos;ll get there.
              </EmptyState>
            </Card>
          )}
          {[...active, ...done].map((g) => {
            const P = PURPOSE[g.purpose] ?? PURPOSE.other;
            return (
              <Card key={g.id} className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                      <P.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 break-words font-medium">{g.name}</h2>
                      <p className="text-xs text-muted">
                        {g.targetDate ? `Target ${formatDateStr(g.targetDate, "MMMM yyyy")}` : "No target date"}
                        {g.accountId ? " · tracks a linked account" : ""}
                      </p>
                    </div>
                  </div>
                  <span className="tabular text-2xl font-semibold">{g.percent}%</span>
                </div>
                <Progress value={g.percent} label={`${g.name} progress`} className="h-2" />
                <p className="mt-2 text-sm text-text-2">
                  {whole(g.savedCents)} of {whole(g.targetCents)}
                  {g.remainingCents > 0 && ` · ${whole(g.remainingCents)} to go`}
                </p>
                {g.status === "achieved" || g.remainingCents === 0 ? (
                  <p className="mt-2 text-sm font-medium text-success">Goal reached. Time to celebrate, or set the next one.</p>
                ) : (
                  <p className="mt-1 text-sm">
                    {g.projectedDate ? (
                      <>
                        At {whole(g.monthlyPaceCents)}/month{g.paceSource === "recent" ? " (your recent pace)" : ""}, you&apos;ll get there around{" "}
                        <strong>{formatDateStr(g.projectedDate, "MMMM yyyy")}</strong>
                        {g.targetDate &&
                          (g.onTrack
                            ? ", on time."
                            : `, after your target. ${g.monthlyNeededCents ? `${whole(g.monthlyNeededCents)}/month reaches it on time.` : ""}`)}
                      </>
                    ) : g.monthlyNeededCents ? (
                      <>Put in about {whole(g.monthlyNeededCents)} a month to reach it by your target date.</>
                    ) : (
                      <>Set a monthly amount to see when you&apos;ll get there.</>
                    )}
                  </p>
                )}
                {g.remainingCents > 0 && (
                  <div className="mt-3">
                    <GoalTradeoff targetCents={g.targetCents} savedCents={g.savedCents} monthlyCents={g.monthlyPaceCents} />
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                  {!g.accountId && g.status === "active" && (
                    <ActionForm action={contributeGoalAction.bind(null, g.id)} showSuccess className="gap-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex w-28 flex-col gap-1 text-xs text-text-2">
                          Add money ($)
                          <Input name="amount" inputMode="decimal" required placeholder="50" />
                        </label>
                        <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-xs text-text-2">
                          Note (optional)
                          <Input name="note" maxLength={300} placeholder="From my paycheck" />
                        </label>
                        <SubmitButton size="sm">Record</SubmitButton>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" name="withdraw" className="accent-[var(--accent)]" /> This is money I took out
                      </label>
                      <p className="text-xs text-muted">LifeFlow records it here; move the money in your bank app.</p>
                    </ActionForm>
                  )}
                  {g.recentContributions.length > 0 && (
                    <ul className="text-xs text-muted">
                      {g.recentContributions.map((c) => (
                        <li key={c.id}>
                          {formatDateStr(c.date, "MMM d")}: {c.amountCents > 0 ? "+" : "−"}
                          {whole(Math.abs(c.amountCents))}
                          {c.note ? ` · ${c.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-accent">Edit goal</summary>
                    <ActionForm action={updateGoalAction.bind(null, g.id)} reset={false} showSuccess className="mt-3">
                      <Field label="Name" htmlFor={`n-${g.id}`}>
                        <Input id={`n-${g.id}`} name="name" defaultValue={g.name} required maxLength={120} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Target ($)" htmlFor={`t-${g.id}`}>
                          <Input id={`t-${g.id}`} name="target" inputMode="decimal" defaultValue={dollars(g.targetCents)} required />
                        </Field>
                        <Field label="Monthly plan ($)" htmlFor={`m-${g.id}`}>
                          <Input id={`m-${g.id}`} name="monthly" inputMode="decimal" defaultValue={dollars(g.monthlyPlanCents)} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Target date" htmlFor={`d-${g.id}`}>
                          <Input id={`d-${g.id}`} name="targetDate" type="date" defaultValue={g.targetDate ?? ""} />
                        </Field>
                        <Field label="For" htmlFor={`p-${g.id}`}>
                          <Select id={`p-${g.id}`} name="purpose" defaultValue={g.purpose}>
                            {Object.entries(PURPOSE).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <SubmitButton size="sm" className="self-end">
                        Save
                      </SubmitButton>
                    </ActionForm>
                    <div className="mt-2 flex gap-1">
                      <ActionButton
                        action={archiveGoalAction.bind(null, g.id)}
                        confirm={`Archive "${g.name}"? You can't add to it afterwards.`}
                        title="Archive goal"
                        className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-text"
                      >
                        Archive
                      </ActionButton>
                      <ActionButton
                        action={deleteGoalAction.bind(null, g.id)}
                        title={`Delete ${g.name}`}
                        className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-danger hover:bg-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </ActionButton>
                    </div>
                  </details>
                </div>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">New goal</h2>
          <ActionForm action={createGoalAction} showSuccess>
            <Field label="What's it for?" htmlFor="g-p">
              <Select id="g-p" name="purpose" defaultValue="emergency">
                {Object.entries(PURPOSE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="g-name">
              <Input id="g-name" name="name" required maxLength={120} placeholder="Japan trip" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target ($)" htmlFor="g-t">
                <Input id="g-t" name="target" inputMode="decimal" required placeholder="3000" />
              </Field>
              <Field label="Saved so far ($)" htmlFor="g-s">
                <Input id="g-s" name="saved" inputMode="decimal" placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target date" htmlFor="g-d">
                <Input id="g-d" name="targetDate" type="date" />
              </Field>
              <Field label="Monthly plan ($)" htmlFor="g-m">
                <Input id="g-m" name="monthly" inputMode="decimal" placeholder="150" />
              </Field>
            </div>
            <Field label="Track an account balance (optional)" htmlFor="g-a">
              <Select id="g-a" name="accountId" defaultValue="">
                <option value="">Don&apos;t link</option>
                {d.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton className="self-end">Create goal</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
