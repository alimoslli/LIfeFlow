import { Check, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, Progress } from "@/components/ui/surface";
import { formatDateStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { goalCheckins, personalGoals } from "@/server/db/schema";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { createPersonalGoalAction, deletePersonalGoalAction, setPersonalGoalDoneAction, stepPersonalGoalAction, updatePersonalGoalAction } from "./actions";

type Goal = typeof personalGoals.$inferSelect;
type Checkins = Map<string, (typeof goalCheckins.$inferSelect)[]>;

const CHECKIN_PROMPT = "Check in on my goals with me: ask how I worked toward each one today, then save what I tell you.";
const said = (c: typeof goalCheckins.$inferSelect) =>
  `${c.note}${c.amountCents ? ` (+$${(c.amountCents / 100).toFixed(c.amountCents % 100 ? 2 : 0)})` : ""}${c.progress ? ` (+${c.progress})` : ""}`;

/** Jarvis asks; you answer in your own words. Today's answers show here. */
export function GoalCheckin({ goals, checkins, today }: { goals: { id: string; title: string }[]; checkins: Checkins; today: string }) {
  if (!goals.length) return null;
  const todays = goals.flatMap((g) => (checkins.get(g.id) ?? []).filter((c) => c.date === today).map((c) => ({ goal: g.title, text: said(c) })));
  return (
    <Card className="p-5">
      <p className="text-xs font-medium tracking-wide text-accent uppercase">Today</p>
      <p className="mt-1 text-[17px] font-medium">How did you work toward your goals today?</p>
      {todays.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {todays.map((t, i) => (
            <li key={i} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="font-medium">{t.goal}:</span> {t.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AskJarvisButton
        prompt={CHECKIN_PROMPT}
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-text"
      >
        {todays.length ? "Add more" : "Tell Jarvis"}
      </AskJarvisButton>
    </Card>
  );
}

/** Goals that aren't about money: done or not, or measured ("4 of 12 books") with a quick +1. */
export function PersonalGoals({ goals, checkins }: { goals: Goal[]; checkins: Checkins }) {
  if (!goals.length)
    return (
      <Card className="p-5">
        <p className="font-medium">Goals that aren&apos;t about money</p>
        <p className="mt-1 text-sm text-text-2">Run a 5K, read 12 books, get a B in Chem. Add one on the right, with a number to track if it has one.</p>
      </Card>
    );
  return (
    <ul className="flex flex-col gap-3">
      {goals.map((g) => {
        const measured = g.target != null;
        const done = !!g.doneAt;
        return (
          <li key={g.id}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <ActionButton
                  action={setPersonalGoalDoneAction.bind(null, g.id, !done)}
                  title={done ? `Mark "${g.title}" not done` : `Mark "${g.title}" done`}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                    done ? "border-accent bg-accent text-accent-text" : "border-border-strong text-transparent",
                  )}
                >
                  <Check className="h-5 w-5" />
                </ActionButton>
                <div className="min-w-0 flex-1">
                  <p className={cn("line-clamp-2 break-words text-[15px] font-medium", done && "text-muted line-through")}>{g.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {measured ? `${g.progress} of ${g.target}${g.unit ? ` ${g.unit}` : ""}` : done ? "Done" : "Not done yet"}
                    {g.targetDate ? ` · by ${formatDateStr(g.targetDate, "MMM d")}` : ""}
                  </p>
                </div>
                {measured && !done && (
                  <ActionButton
                    action={stepPersonalGoalAction.bind(null, g.id, g.progress + 1)}
                    title={`One more for "${g.title}"`}
                    className="min-h-11 shrink-0 rounded-full bg-surface-2 px-4 text-sm font-semibold"
                  >
                    +1
                  </ActionButton>
                )}
              </div>
              {measured && <Progress value={Math.min(100, (g.progress / g.target!) * 100)} className="mt-3" />}
              {checkins.get(g.id)?.[0] && (
                <p className="mt-2 text-xs text-text-2">
                  Last: {said(checkins.get(g.id)![0])} · {formatDateStr(checkins.get(g.id)![0].date, "MMM d")}
                </p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                <ActionForm action={updatePersonalGoalAction.bind(null, g.id)} reset={false} showSuccess className="mt-3 gap-3">
                  <Field label="Goal" htmlFor={`pg-t-${g.id}`}>
                    <Input id={`pg-t-${g.id}`} name="title" required defaultValue={g.title} />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Done so far" htmlFor={`pg-p-${g.id}`}>
                      <Input id={`pg-p-${g.id}`} name="progress" inputMode="numeric" defaultValue={String(g.progress)} />
                    </Field>
                    <Field label="Target" htmlFor={`pg-n-${g.id}`}>
                      <Input id={`pg-n-${g.id}`} name="target" inputMode="numeric" defaultValue={g.target != null ? String(g.target) : ""} />
                    </Field>
                    <Field label="Of what" htmlFor={`pg-u-${g.id}`}>
                      <Input id={`pg-u-${g.id}`} name="unit" defaultValue={g.unit ?? ""} placeholder="books" />
                    </Field>
                  </div>
                  <Field label="By (optional)" htmlFor={`pg-d-${g.id}`}>
                    <Input id={`pg-d-${g.id}`} name="targetDate" type="date" defaultValue={g.targetDate ?? ""} />
                  </Field>
                  <SubmitButton size="sm" className="self-end">
                    Save
                  </SubmitButton>
                </ActionForm>
                <ActionButton
                  action={deletePersonalGoalAction.bind(null, g.id)}
                  confirm={`Delete "${g.title}"?`}
                  title={`Delete ${g.title}`}
                  className="mt-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </ActionButton>
              </details>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** New goal (not money): a name, and if it has one, a number to reach and a date. */
export function NewPersonalGoal() {
  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-text-2 uppercase">New goal</h2>
      <ActionForm action={createPersonalGoalAction} showSuccess className="gap-3">
        <Field label="Goal" htmlFor="pg-title">
          <Input id="pg-title" name="title" required placeholder="Read 12 books" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number (optional)" htmlFor="pg-target">
            <Input id="pg-target" name="target" inputMode="numeric" placeholder="12" />
          </Field>
          <Field label="Of what" htmlFor="pg-unit">
            <Input id="pg-unit" name="unit" placeholder="books" />
          </Field>
        </div>
        <Field label="By (optional)" htmlFor="pg-date">
          <Input id="pg-date" name="targetDate" type="date" />
        </Field>
        <SubmitButton className="self-end">Add goal</SubmitButton>
      </ActionForm>
    </Card>
  );
}
