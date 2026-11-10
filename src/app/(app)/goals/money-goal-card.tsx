import { PixelIcon } from "@/components/pixel/pixel-icon";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, Progress } from "@/components/ui/surface";
import { formatDateStr } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { archiveGoalAction, contributeGoalAction, createGoalAction, deleteGoalAction, updateGoalAction } from "../finances/actions";
import type { goalsWithPlans } from "@/server/services/finance/goals";
import type { listAccounts } from "@/server/services/finance/accounts";
import { GoalTradeoff } from "./tradeoff";
import { PURPOSE } from "./purpose";

export type MoneyGoal = Awaited<ReturnType<typeof goalsWithPlans>>[number];
type Account = Awaited<ReturnType<typeof listAccounts>>[number];

const whole = (c: number) => formatCents(c).replace(/\.\d\d$/, "");
const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

/** One money goal in full: progress, the pace, add money, edit, archive, delete. Opens from its tile. */
export function MoneyGoalCard({ g }: { g: MoneyGoal }) {
  const P = PURPOSE[g.purpose] ?? PURPOSE.other;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <P.icon className="h-8 w-8" />
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
                (g.onTrack ? ", on time." : `, after your target. ${g.monthlyNeededCents ? `${whole(g.monthlyNeededCents)}/month reaches it on time.` : ""}`)}
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
              <PixelIcon name="trash" className="h-4 w-4" /> Delete
            </ActionButton>
          </div>
        </details>
      </div>
    </Card>
  );
}

/** The new money goal form. */
export function NewMoneyGoal({ accounts }: { accounts: Account[] }) {
  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 text-[0.8125rem] font-semibold tracking-wide text-text-2 uppercase">New money goal</h2>
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
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton className="self-end">Create goal</SubmitButton>
      </ActionForm>
    </Card>
  );
}
