"use client";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

export function ShiftDialog({ action, employers, today }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; employers: { id: string; name: string }[]; today: string }) {
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
              <Input id="s-date" name="date" type="date" required defaultValue={today} />
            </Field>
            <Field label="Start" htmlFor="s-start">
              <Input id="s-start" name="startTime" type="time" required defaultValue="09:00" />
            </Field>
            <Field label="End" htmlFor="s-end">
              <Input id="s-end" name="endTime" type="time" required defaultValue="17:00" />
            </Field>
          </div>
          <Field label="Unpaid break (minutes)" htmlFor="s-br">
            <Input id="s-br" name="breakMinutes" type="number" min={0} max={600} defaultValue={30} />
          </Field>
          <SubmitButton className="self-end">Add shift</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}
