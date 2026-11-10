import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { HABIT_IDEAS, listHabits } from "@/server/services/habits";
import { archiveHabitAction, checkHabitAction, createHabitAction, deleteHabitAction, shrinkHabitAction } from "./actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

const CADENCE = { daily: "every day", weekly: "every week", weekends: "every weekend", payday: "every payday" } as const;
const PERIOD = { daily: "today", weekly: "this week", weekends: "this weekend", payday: "this pay period" } as const;
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/** Habits live with Goals: the small repeated things that get you there (money, school, health or anything else). */
export async function HabitsSection() {
  const habits = await withCurrentUser(async (s, u) => listHabits(s, todayIn(u.timezone)));
  const active = habits.filter((h) => h.active);
  const paused = habits.filter((h) => !h.active);
  return (
    <section aria-label="Habits" className="flex flex-col gap-6">
      <h2 className="-mb-2 text-[1.375rem] font-medium tracking-tight">Habits</h2>

      {active.length > 0 && (
        <ul className="flex flex-col gap-3">
          {active.map((h) => (
            <li key={h.id}>
              <Card as="div" className="p-4">
                <div className="flex items-start gap-3">
                  <ActionButton
                    action={checkHabitAction.bind(null, h.id, !h.doneThisPeriod)}
                    title={h.doneThisPeriod ? `Uncheck ${h.title}` : `Done ${PERIOD[h.cadence]}: ${h.title}`}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                      h.doneThisPeriod ? "border-accent bg-accent text-accent-text" : "border-border-strong text-muted",
                    )}
                  >
                    <PixelIcon name="check" className="h-5 w-5" />
                  </ActionButton>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-medium break-words">{h.title}</p>
                    <p className="text-xs text-muted">
                      {CADENCE[h.cadence]}
                      {h.target ? ` · ${h.kind === "save" ? usd(h.target) : h.kind === "study" ? `${h.target} min` : h.target}` : ""}
                    </p>
                    <div
                      className="mt-2 flex items-center gap-1"
                      role="img"
                      aria-label={`Last ${h.recent.length} times, newest first: ${h.recent.filter(Boolean).length} done`}
                    >
                      {h.recent.map((d, i) => (
                        <span key={i} className={cn("h-2.5 w-2.5 rounded-full", d ? "bg-accent" : "bg-surface-3")} />
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-lg font-semibold">
                      <PixelIcon name="flame" className={cn("h-4 w-4", !h.current && "opacity-40 grayscale")} /> {h.current}
                    </p>
                    <p className="text-xs text-muted">best {h.best}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-end gap-1">
                  {h.target && h.target > 1 && h.recent.slice(1, 6).filter((d) => !d).length >= 3 && (
                    <ActionButton
                      action={shrinkHabitAction.bind(null, h.id, Math.max(1, Math.round(h.target / 2)))}
                      className="rounded-full px-3 text-sm font-medium text-accent"
                    >
                      Make it smaller
                    </ActionButton>
                  )}
                  <ActionButton
                    action={archiveHabitAction.bind(null, h.id, false)}
                    title={`Pause ${h.title}`}
                    className="tap flex items-center justify-center text-muted"
                  >
                    <PixelIcon name="pause" className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton
                    action={deleteHabitAction.bind(null, h.id)}
                    confirm={`Delete "${h.title}" and its streak?`}
                    title={`Delete ${h.title}`}
                    className="tap flex items-center justify-center text-muted hover:text-danger"
                  >
                    <PixelIcon name="trash" className="h-4 w-4" />
                  </ActionButton>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-5">
        <h2 className="font-medium">Start a habit</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {HABIT_IDEAS.map((i) => (
            <ActionForm key={i.title} action={createHabitAction} className="contents">
              <input type="hidden" name="title" value={i.title} />
              <input type="hidden" name="kind" value={i.kind} />
              <input type="hidden" name="cadence" value={i.cadence} />
              {i.target && <input type="hidden" name="target" value={i.kind === "save" ? i.target / 100 : i.target} />}
              <button type="submit" className="lf-sb lf-sb-app lf-sb-sm">
                + {i.title}
              </button>
            </ActionForm>
          ))}
        </div>
        <ActionForm action={createHabitAction} className="mt-4 gap-3">
          <Field label="Or your own" htmlFor="h-title">
            <Input id="h-title" name="title" required maxLength={120} placeholder="Walk 20 minutes" className="h-11" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How often" htmlFor="h-cad">
              <Select id="h-cad" name="cadence" defaultValue="daily" className="h-11">
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="weekends">Weekends</option>
                <option value="payday">Every payday</option>
              </Select>
            </Field>
            <Field label="Type" htmlFor="h-kind">
              <Select id="h-kind" name="kind" defaultValue="custom" className="h-11">
                <option value="custom">Other</option>
                <option value="save">Save money ($)</option>
                <option value="study">Study (minutes)</option>
                <option value="no_spend">No spending</option>
              </Select>
            </Field>
          </div>
          <Field label="Amount or minutes (optional)" htmlFor="h-target">
            <Input id="h-target" name="target" inputMode="decimal" placeholder="10" className="h-11 max-w-[10rem]" />
          </Field>
          <SubmitButton className="self-start max-sm:h-12 max-sm:w-full">Add habit</SubmitButton>
        </ActionForm>
      </Card>

      {paused.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Paused</h2>
          <ul className="flex flex-col gap-2">
            {paused.map((h) => (
              <li key={h.id} className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface px-4 shadow-soft">
                <span className="flex-1 text-[0.9375rem] text-text-2">{h.title}</span>
                <ActionButton
                  action={archiveHabitAction.bind(null, h.id, true)}
                  title={`Resume ${h.title}`}
                  className="tap flex items-center justify-center text-accent"
                >
                  <PixelIcon name="play" className="h-4 w-4" />
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
