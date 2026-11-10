"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { deleteEventAction, editOccurrenceAction, skipOccurrenceAction, updateEventAction } from "../calendar/actions";
import { deleteAssignmentAction, toggleAssignmentAction, updateAssignmentAction } from "../school/actions";
import { deleteShiftAction, updateShiftAction } from "../work/actions";

/** Everything needed to edit one calendar block in place. */
export type Block =
  | {
      origin: "event";
      id: string;
      title: string;
      date: string;
      startTime: string | null;
      endTime: string | null;
      allDay: boolean;
      kind: string;
      location: string | null;
      description: string | null;
      repeats: boolean;
    }
  | { origin: "shift"; id: string; employerId: string; date: string; startTime: string; endTime: string; breakMinutes: number; notes: string | null }
  | { origin: "assignment"; id: string; title: string; kind: string; dueDate: string | null; dueTime: string | null; description: string | null; done: boolean }
  | { origin: "task"; id: string };

const EVENT_KINDS = ["personal", "class", "exam", "work", "study", "appointment", "reminder", "other"];
const ASSIGNMENT_KINDS = ["assignment", "exam", "quiz", "project", "reading", "lab", "discussion", "other"];
const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

/** A calendar row that opens its editor: events, classes, shifts and assignments in a sheet; to-dos on their own page. */
export function EditableBlock({ block, className, children }: { block: Block | null; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!block) return <div className={className}>{children}</div>;
  if (block.origin === "task")
    return (
      <Link href={`/tasks/${block.id}`} className={className}>
        {children}
      </Link>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${className} w-full text-left`}>
        {children}
      </button>
      <BlockSheet block={open ? block : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** The editor for one event, shift or assignment, in a sheet (Plan's rows and the Today timeline's cards). */
export function BlockSheet({ block, onClose }: { block: Exclude<Block, { origin: "task" }> | null; onClose: () => void }) {
  return (
    <Sheet open={!!block} onClose={onClose} title={block?.origin === "shift" ? "Shift" : block?.origin === "assignment" ? "Homework" : "Event"}>
      {block?.origin === "event" && <EventForm key={block.id} b={block} done={onClose} />}
      {block?.origin === "shift" && <ShiftForm key={block.id} b={block} done={onClose} />}
      {block?.origin === "assignment" && <AssignmentForm key={block.id} b={block} done={onClose} />}
    </Sheet>
  );
}

function EventForm({ b, done }: { b: Extract<Block, { origin: "event" }>; done: () => void }) {
  const [allDay, setAllDay] = useState(b.allDay);
  // A repeating event: change just this day, or every day it repeats.
  const [scope, setScope] = useState<"one" | "all">("one");
  const action = b.repeats && scope === "one" ? editOccurrenceAction.bind(null, b.id, b.date) : updateEventAction.bind(null, b.id);
  return (
    <div className="flex flex-col gap-4">
      {b.repeats && (
        <div role="radiogroup" aria-label="Change" className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-sm">
          {(
            [
              ["one", "Just this day"],
              ["all", "Every time"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={scope === v}
              onClick={() => setScope(v)}
              className={`min-h-10 rounded-full font-medium ${scope === v ? "bg-surface shadow-soft" : "text-text-2"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <ActionForm key={scope} action={action} reset={false} onSuccess={done} className="gap-3">
        <Field label="Title" htmlFor="b-title">
          <Input id="b-title" name="title" required defaultValue={b.title} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="b-date">
            <Input id="b-date" name="date" type="date" required defaultValue={b.date} disabled={b.repeats && scope === "all"} />
          </Field>
          <Field label="Type" htmlFor="b-kind">
            <Select id="b-kind" name="kind" defaultValue={b.kind}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="allDay" value="on" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5 accent-accent" />
          All day
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" htmlFor="b-start">
              <Input id="b-start" name="startTime" type="time" required defaultValue={b.startTime ?? ""} />
            </Field>
            <Field label="Ends" htmlFor="b-end">
              <Input id="b-end" name="endTime" type="time" defaultValue={b.endTime ?? ""} />
            </Field>
          </div>
        )}
        <Field label="Place" htmlFor="b-loc">
          <Input id="b-loc" name="location" defaultValue={b.location ?? ""} placeholder="Room 204" />
        </Field>
        <Field label="Notes" htmlFor="b-notes">
          <Input id="b-notes" name="description" defaultValue={b.description ?? ""} />
        </Field>
        <SubmitButton className="max-sm:h-12">Save</SubmitButton>
      </ActionForm>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {b.repeats && (
          <ActionButton
            action={skipOccurrenceAction.bind(null, b.id, b.date)}
            title="Remove just this day"
            className="lf-sb lf-sb-app lf-sb-sm"
            onSuccess={done}
          >
            Remove this day
          </ActionButton>
        )}
        <ActionButton
          action={deleteEventAction.bind(null, b.id)}
          confirm={b.repeats ? `Delete every "${b.title}"?` : `Delete "${b.title}"?`}
          title={b.repeats ? "Delete every time" : "Delete event"}
          className="min-h-11 rounded-full px-4 text-sm text-danger"
          onSuccess={done}
        >
          {b.repeats ? "Delete all" : "Delete"}
        </ActionButton>
      </div>
    </div>
  );
}

function ShiftForm({ b, done }: { b: Extract<Block, { origin: "shift" }>; done: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={updateShiftAction.bind(null, b.id)} reset={false} onSuccess={done} className="gap-3">
        <input type="hidden" name="employerId" value={b.employerId} />
        <Field label="Date" htmlFor="s-date">
          <Input id="s-date" name="date" type="date" required defaultValue={b.date} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="s-start">
            <Input id="s-start" name="startTime" type="time" required defaultValue={b.startTime} />
          </Field>
          <Field label="Ends" htmlFor="s-end">
            <Input id="s-end" name="endTime" type="time" required defaultValue={b.endTime} />
          </Field>
        </div>
        <Field label="Unpaid break (minutes)" htmlFor="s-break">
          <Input id="s-break" name="breakMinutes" inputMode="numeric" defaultValue={String(b.breakMinutes)} />
        </Field>
        <Field label="Notes" htmlFor="s-notes">
          <Input id="s-notes" name="notes" defaultValue={b.notes ?? ""} />
        </Field>
        <SubmitButton className="max-sm:h-12">Save</SubmitButton>
      </ActionForm>
      <div className="border-t border-border pt-3">
        <ActionButton
          action={deleteShiftAction.bind(null, b.id)}
          confirm="Delete this shift?"
          title="Delete shift"
          className="min-h-11 rounded-full px-4 text-sm text-danger"
          onSuccess={done}
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

function AssignmentForm({ b, done }: { b: Extract<Block, { origin: "assignment" }>; done: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={updateAssignmentAction.bind(null, b.id)} reset={false} onSuccess={done} className="gap-3">
        <Field label="Title" htmlFor="a-title">
          <Input id="a-title" name="title" required defaultValue={b.title} />
        </Field>
        <Field label="Type" htmlFor="a-kind">
          <Select id="a-kind" name="kind" defaultValue={b.kind}>
            {ASSIGNMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due" htmlFor="a-date">
            <Input id="a-date" name="dueDate" type="date" defaultValue={b.dueDate ?? ""} />
          </Field>
          <Field label="Time" htmlFor="a-time">
            <Input id="a-time" name="dueTime" type="time" defaultValue={b.dueTime ?? ""} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="a-notes">
          <Input id="a-notes" name="description" defaultValue={b.description ?? ""} />
        </Field>
        <SubmitButton className="max-sm:h-12">Save</SubmitButton>
      </ActionForm>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <ActionButton
          action={toggleAssignmentAction.bind(null, b.id)}
          title={b.done ? "Mark not done" : "Mark done"}
          className="lf-sb lf-sb-app lf-sb-sm"
          onSuccess={done}
        >
          {b.done ? "Mark not done" : "Mark done"}
        </ActionButton>
        <ActionButton
          action={deleteAssignmentAction.bind(null, b.id)}
          confirm={`Delete "${b.title}"?`}
          title="Delete homework"
          className="min-h-11 rounded-full px-4 text-sm text-danger"
          onSuccess={done}
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}
