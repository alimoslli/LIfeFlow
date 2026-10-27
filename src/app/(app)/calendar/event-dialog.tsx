"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventDialog({ action, defaultDate, courses }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaultDate: string; courses: { id: string; name: string; code: string | null }[] }) {
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState("none");
  return (
    <Dialog
      trigger={
        <>
          <Plus className="h-4 w-4" /> Event
        </>
      }
      title="New event"
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <Field label="Title" htmlFor="e-title">
            <Input id="e-title" name="title" required placeholder="Study session" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" htmlFor="e-date">
              <Input id="e-date" name="date" type="date" required defaultValue={defaultDate} />
            </Field>
            <Field label="Start" htmlFor="e-start">
              <Input id="e-start" name="startTime" type="time" required={!allDay} disabled={allDay} defaultValue="09:00" />
            </Field>
            <Field label="End" htmlFor="e-end">
              <Input id="e-end" name="endTime" type="time" disabled={allDay} defaultValue="10:00" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--accent)]" /> All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="e-kind">
              <Select id="e-kind" name="kind" defaultValue="personal">
                {["personal", "class", "study", "exam", "work", "appointment", "reminder", "other"].map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Course (optional)" htmlFor="e-course">
              <Select id="e-course" name="courseId" defaultValue="">
                <option value="">None</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ?? c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Location" htmlFor="e-loc">
            <Input id="e-loc" name="location" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeat" htmlFor="e-rep">
              <Select id="e-rep" name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </Select>
            </Field>
            {repeat !== "none" && (
              <Field label="Until" htmlFor="e-until">
                <Input id="e-until" name="until" type="date" />
              </Field>
            )}
          </div>
          {repeat === "weekly" && (
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="mb-1.5 text-[13px] font-medium text-text-2">On</legend>
              {DAYS.map((d, i) => (
                <label key={d} className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                  <input type="checkbox" name="byDay" value={i} className="sr-only" /> {d}
                </label>
              ))}
            </fieldset>
          )}
          <SubmitButton className="self-end">Add event</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}
