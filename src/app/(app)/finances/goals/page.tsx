import type { Metadata } from "next";
import { Archive, PiggyBank } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Money, Progress } from "@/components/ui/surface";
import { formatDateStr, todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAccounts } from "@/server/services/finance/accounts";
import { listGoals, monthlyContributionNeeded } from "@/server/services/finance/planning";
import { archiveGoalAction, createGoalAction, updateGoalAction } from "../actions";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const d = await withCurrentUser(async (s, u) => {
    const [goals, accounts] = await series(() => listGoals(s), () => listAccounts(s, { types: ["depository", "investment", "cash"] }));
    return { goals, accounts, today: todayIn(u.timezone) };
  });
  return (
    <>
      <h1 className="mb-5 font-display text-[28px] font-medium tracking-tight">Goals</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {d.goals.length === 0 && (
            <Card>
              <EmptyState icon={<PiggyBank />} title="No goals yet">
                An emergency fund, a trip, a laptop — set a target and track it. Link a savings account to track its balance automatically.
              </EmptyState>
            </Card>
          )}
          {d.goals.map((g) => {
            const monthly = monthlyContributionNeeded(g.targetCents, g.savedCents, g.targetDate, d.today);
            return (
              <Card key={g.id} className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{g.name}</h2>
                    <p className="text-xs text-muted">
                      {g.targetDate ? `Target ${formatDateStr(g.targetDate, "MMMM yyyy")}` : "No target date"}
                      {g.accountId ? " · tracks a linked account balance" : ""}
                    </p>
                  </div>
                  <span className="tabular text-2xl font-semibold">{g.percent}%</span>
                </div>
                <Progress value={g.percent} label={g.name} className="h-2" />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-text-2">
                    <Money cents={g.savedCents} /> of <Money cents={g.targetCents} />
                    {monthly ? <span className="text-muted"> · about <Money cents={monthly} />/month to stay on track</span> : null}
                  </span>
                  <div className="flex items-center gap-2">
                    {!g.accountId && (
                      <ActionForm action={updateGoalAction.bind(null, g.id)} reset={false} className="flex-row gap-1.5">
                        <Input name="saved" inputMode="decimal" defaultValue={(g.savedCents / 100).toFixed(2)} className="h-8 w-28 text-[13px]" aria-label="Saved so far" />
                        <SubmitButton size="sm" variant="secondary">
                          Update
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionButton action={archiveGoalAction.bind(null, g.id)} confirm={`Archive "${g.name}"?`} title="Archive goal" className="p-1 text-muted hover:text-text">
                      <Archive className="h-4 w-4" />
                    </ActionButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">New goal</h2>
          <ActionForm action={createGoalAction}>
            <Field label="Name" htmlFor="g-name">
              <Input id="g-name" name="name" required placeholder="Emergency fund" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target ($)" htmlFor="g-t">
                <Input id="g-t" name="target" inputMode="decimal" required placeholder="3000" />
              </Field>
              <Field label="Saved so far ($)" htmlFor="g-s">
                <Input id="g-s" name="saved" inputMode="decimal" placeholder="0" />
              </Field>
            </div>
            <Field label="Target date" htmlFor="g-d">
              <Input id="g-d" name="targetDate" type="date" />
            </Field>
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
