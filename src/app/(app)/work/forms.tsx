"use client";
import { useState } from "react";
import { WorkHours } from "@/components/work-hours";
import type { WorkSchedule } from "@/server/db/schema";
import { addDaysStr } from "@/lib/dates";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

export function ShiftDialog({
  action,
  employers,
  today,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  employers: { id: string; name: string }[];
  today: string;
}) {
  return (
    <Dialog trigger="Add shift" title="Add a shift">
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <Field label="Job" htmlFor="s-emp">
            <Select id="s-emp" name="employerId" required>
              {employers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" htmlFor="s-date">
              <Input id="s-date" name="date" type="date" required min={addDaysStr(today, -366)} />
            </Field>
            <Field label="Start" htmlFor="s-start">
              <Input id="s-start" name="startTime" type="time" required />
            </Field>
            <Field label="End" htmlFor="s-end">
              <Input id="s-end" name="endTime" type="time" required />
            </Field>
          </div>
          <Field label="Unpaid break (minutes)" htmlFor="s-br">
            <Input id="s-br" name="breakMinutes" type="number" min={0} max={600} placeholder="0" />
          </Field>
          <SubmitButton className="self-end">Add shift</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}

/** Regular hours as a form field (`schedule`, JSON). */
export function WorkHoursField({ initial = null }: { initial?: WorkSchedule | null }) {
  const [hours, setHours] = useState<WorkSchedule | null>(initial);
  return <WorkHours value={hours} onChange={setHours} name="schedule" />;
}

/** "Regular hours" for a job, saved on its own: changing them replaces the future days filled from the old hours. */
export function JobHoursForm({
  action,
  employerId,
  initial,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  employerId: string;
  initial: WorkSchedule | null;
}) {
  return (
    <ActionForm action={action} reset={false} showSuccess className="mt-2">
      <input type="hidden" name="employerId" value={employerId} />
      <WorkHoursField initial={initial} />
      <SubmitButton className="self-end">Save hours</SubmitButton>
    </ActionForm>
  );
}
