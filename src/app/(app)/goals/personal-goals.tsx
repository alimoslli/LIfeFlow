import { Check, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, Progress } from "@/components/ui/surface";
import { formatDateStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { personalGoals } from "@/server/db/schema";
import { createPersonalGoalAction, deletePersonalGoalAction, setPersonalGoalDoneAction, stepPersonalGoalAction, updatePersonalGoalAction } from "./actions";

type Goal = typeof personalGoals.$inferSelect;

/** Goals that aren't about money: done or not, or measured ("4 of 12 books") with a quick +1. */
export function PersonalGoals({ goals }: { goals: Goal[] }) {
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
