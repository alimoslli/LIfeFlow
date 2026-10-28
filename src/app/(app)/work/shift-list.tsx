"use client";
import { useState } from "react";
import { AlertCircle, ChevronRight, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SwipeRow } from "@/components/swipe-row";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DateField, TimeField } from "@/components/ui/pickers";
import { Sheet } from "@/components/ui/sheet";
import { formatIn, localDateOf, localTimeOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { cancelShiftAction, deleteShiftAction, markWorkedAction, recordHoursAction, updateShiftAction } from "./actions";

export type ShiftItem = {
  id: string;
  employerId: string;
  startsAt: Date;
  endsAt: Date;
  recordedStart: Date | null;
  recordedEnd: Date | null;
  breakMinutes: number;
  notes: string | null;
  status: "scheduled" | "worked" | "cancelled";
  paidHours: number;
};

/** Shifts: tap to edit, swipe right to mark worked, left to delete (Undo). Past shifts ask for actual hours. */
export function ShiftList({
  shifts,
  employers,
  tz,
  today,
  now,
}: {
  shifts: ShiftItem[];
  employers: { id: string; name: string }[];
  tz: string;
  today: string;
  now: number;
}) {
  const [editing, setEditing] = useState<ShiftItem | null>(null);
  const name = new Map(employers.map((e) => [e.id, e.name]));
  return (
    <>
      <ul className="divide-y divide-border">
        {shifts.map((s) => {
          const cancelled = s.status === "cancelled";
          const needsHours = s.status === "scheduled" && s.endsAt.getTime() < now;
          return (
            <li key={s.id}>
              <SwipeRow
                done={s.status === "worked"}
                onComplete={!cancelled && s.status !== "worked" ? markWorkedAction.bind(null, s.id) : undefined}
                onDelete={deleteShiftAction.bind(null, s.id)}
              >
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className={cn("flex w-full items-start gap-4 px-5 py-4 text-left", cancelled && "opacity-50")}
                  aria-label={`Edit shift on ${formatIn(s.startsAt, tz, "EEEE, MMM d")}`}
                >
                  <span className="w-11 shrink-0 text-center">
                    <span className="block text-[11px] font-medium text-muted uppercase">{formatIn(s.startsAt, tz, "EEE")}</span>
                    <span className="block font-display text-2xl leading-tight">{formatIn(s.startsAt, tz, "d")}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">
                      {formatIn(s.startsAt, tz, "h:mm")} to {formatIn(s.endsAt, tz, "h:mm a")}
                    </span>
                    <span className="block text-sm text-muted">
                      {name.get(s.employerId) ?? "Job"}
                      {s.breakMinutes ? ` · ${s.breakMinutes} min break` : ""}
                    </span>
                    {s.recordedStart && s.recordedEnd && (
                      <span className="mt-0.5 block text-sm text-text-2">
                        Clocked {formatIn(s.recordedStart, tz, "h:mm")} to {formatIn(s.recordedEnd, tz, "h:mm a")}
                      </span>
                    )}
                    {needsHours && (
                      <span className="mt-1 flex items-center gap-1 text-sm text-warning">
                        <AlertCircle className="h-3.5 w-3.5" /> Did you work it? Tap to record hours.
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-[15px]">{s.paidHours.toFixed(1)} h</span>
                    <span
                      className={cn(
                        "block text-xs",
                        cancelled ? "text-muted" : s.status === "worked" ? "text-success" : needsHours ? "text-warning" : "text-info",
                      )}
                    >
                      {cancelled ? "Cancelled" : s.status === "worked" ? "Worked" : needsHours ? "Needs hours" : "Scheduled"}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" />
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Shift">
        {editing && (
          <div className="flex flex-col gap-5">
            {editing.status === "scheduled" && editing.endsAt.getTime() < now && (
              <div className="rounded-2xl bg-warning-soft p-4">
                <p className="text-sm font-medium text-warning">This shift is over. Did you work it?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    action={markWorkedAction.bind(null, editing.id)}
                    onSuccess={() => setEditing(null)}
                    className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
                  >
                    Yes, as scheduled
                  </ActionButton>
                  <ActionButton
                    action={cancelShiftAction.bind(null, editing.id)}
                    onSuccess={() => setEditing(null)}
                    className="min-h-11 rounded-full bg-surface px-4 text-sm"
                  >
                    No, it was cancelled
                  </ActionButton>
                </div>
              </div>
            )}
            <section aria-label="Actual hours">
              <h3 className="mb-2 text-[15px] font-semibold">Actual hours</h3>
              <ActionForm action={recordHoursAction.bind(null, editing.id)} reset={false} onSuccess={() => setEditing(null)} className="gap-3">
                <TimeField
                  name="clockIn"
                  label="Clocked in"
                  defaultValue={localTimeOf(editing.recordedStart ?? editing.startsAt, tz)}
                  required
                  allowNone={false}
                />
                <TimeField
                  name="clockOut"
                  label="Clocked out"
                  defaultValue={localTimeOf(editing.recordedEnd ?? editing.endsAt, tz)}
                  required
                  allowNone={false}
                />
                <SubmitButton variant="secondary" className="h-12 w-full">
                  Save actual hours
                </SubmitButton>
              </ActionForm>
            </section>
            <section aria-label="Schedule">
              <h3 className="mb-2 text-[15px] font-semibold">Schedule</h3>
              <ActionForm action={updateShiftAction.bind(null, editing.id)} reset={false} onSuccess={() => setEditing(null)} className="gap-3">
                <Field label="Job" htmlFor="sh-emp">
                  <Select id="sh-emp" name="employerId" defaultValue={editing.employerId} className="h-12 text-[16px]">
                    {employers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <DateField name="date" label="Date" today={today} defaultValue={localDateOf(editing.startsAt, tz)} required allowNone={false} />
                <TimeField name="startTime" label="Starts" defaultValue={localTimeOf(editing.startsAt, tz)} required allowNone={false} />
                <TimeField name="endTime" label="Ends" defaultValue={localTimeOf(editing.endsAt, tz)} required allowNone={false} />
                <Field label="Unpaid break (minutes)" htmlFor="sh-br">
                  <Input
                    id="sh-br"
                    name="breakMinutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={600}
                    defaultValue={editing.breakMinutes || ""}
                    className="h-12 text-[16px]"
                  />
                </Field>
                <Field label="Notes" htmlFor="sh-notes">
                  <Textarea id="sh-notes" name="notes" defaultValue={editing.notes ?? ""} rows={2} className="text-[16px]" />
                </Field>
                <SubmitButton className="h-12 w-full">Save shift</SubmitButton>
              </ActionForm>
            </section>
            <div className="flex items-center justify-between gap-2">
              {editing.status !== "cancelled" ? (
                <ActionButton
                  action={cancelShiftAction.bind(null, editing.id)}
                  onSuccess={() => setEditing(null)}
                  className="min-h-11 rounded-full px-4 text-sm text-muted hover:text-text"
                >
                  Mark cancelled
                </ActionButton>
              ) : (
                <span />
              )}
              <ActionButton
                action={deleteShiftAction.bind(null, editing.id)}
                onSuccess={() => setEditing(null)}
                title="Delete shift"
                className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm text-danger hover:bg-danger-soft"
              >
                <Trash2 className="h-4 w-4" /> Delete shift
              </ActionButton>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
