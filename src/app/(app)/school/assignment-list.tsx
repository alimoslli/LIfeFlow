"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SwipeRow } from "@/components/swipe-row";
import { TaskCheck } from "@/components/task-check";
import { SubmitButton } from "@/components/ui/button";
import { CountedInput } from "@/components/ui/counted-input";
import { Field, Input, Select } from "@/components/ui/field";
import { DateField, TimeField } from "@/components/ui/pickers";
import { Sheet } from "@/components/ui/sheet";
import { dueLabel, localDateOf, localTimeOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { listAssignments } from "@/server/services/school";
import { deleteAssignmentAction, toggleAssignmentAction, updateAssignmentAction } from "./actions";

type A = Awaited<ReturnType<typeof listAssignments>>[number];

const KIND_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = { exam: "danger", quiz: "warning", project: "info" };
const KINDS = ["assignment", "exam", "quiz", "project", "reading", "lab", "discussion", "other"] as const;

/** Assignments: tap to edit in a sheet, swipe right to complete, left to delete (with Undo). */
export function AssignmentList({ items, tz, showCourse = true, today }: { items: A[]; tz: string; showCourse?: boolean; today: string }) {
  const [editing, setEditing] = useState<A | null>(null);
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((a) => {
          const due = dueLabel(a.dueAt, a.dueAllDay, tz);
          const done = a.status === "done";
          return (
            <li key={a.id} data-testid="assignment-row">
              <SwipeRow done={done} onComplete={toggleAssignmentAction.bind(null, a.id)} onDelete={deleteAssignmentAction.bind(null, a.id)}>
                <div className="flex items-center gap-3 px-4 py-1.5 sm:px-5">
                  <TaskCheck done={done} action={toggleAssignmentAction.bind(null, a.id)} label={`Mark ${a.title} ${done ? "not done" : "done"}`} />
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
                    aria-label={`Edit ${a.title}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("line-clamp-2 text-[15px] leading-snug", done && "text-muted line-through")}>{a.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        {showCourse && (
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.course.color ?? "var(--accent)" }} />
                            {a.course.code ?? a.course.name}
                          </span>
                        )}
                        {a.kind !== "assignment" && (
                          <span className={cn(KIND_TONE[a.kind] === "danger" && "font-medium text-danger")}>
                            {showCourse ? "· " : ""}
                            {a.kind[0].toUpperCase() + a.kind.slice(1)}
                          </span>
                        )}
                        {a.source === "jarvis" && <span>· added by Jarvis</span>}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-right text-xs",
                        !done && due.overdue ? "font-medium text-danger" : !done && due.soon ? "text-warning" : "text-muted",
                      )}
                    >
                      {due.text || "No date"}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </button>
                </div>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit assignment">
        {editing && (
          <div className="flex flex-col gap-4">
            <ActionForm action={updateAssignmentAction.bind(null, editing.id)} reset={false} onSuccess={() => setEditing(null)} className="gap-4">
              <Field label="Title" htmlFor="a-title">
                <CountedInput id="a-title" name="title" defaultValue={editing.title} required max={300} multiline rows={2} />
              </Field>
              <Field label="Type" htmlFor="a-kind">
                <Select id="a-kind" name="kind" defaultValue={editing.kind} className="h-12 text-[16px]">
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <DateField name="dueDate" label="Due" today={today} defaultValue={editing.dueAt ? localDateOf(editing.dueAt, tz) : ""} />
              <TimeField name="dueTime" label="Time" defaultValue={editing.dueAt && !editing.dueAllDay ? localTimeOf(editing.dueAt, tz) : ""} />
              <Field label="Link (optional)" htmlFor="a-url">
                <Input id="a-url" name="url" type="url" defaultValue={editing.url ?? ""} placeholder="https://" className="h-12 text-[16px]" />
              </Field>
              <Field label="Grade (optional)" htmlFor="a-grade">
                <Input id="a-grade" name="grade" defaultValue={editing.grade ?? ""} placeholder="92 or A-" className="h-12 text-[16px]" />
              </Field>
              <SubmitButton className="h-12 w-full text-[15px]">Save</SubmitButton>
            </ActionForm>
            <div className="flex items-center justify-between gap-2">
              {editing.url ? (
                <a href={editing.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1.5 text-sm text-accent">
                  <ExternalLink className="h-4 w-4" /> Open link
                </a>
              ) : (
                <Link href={`/school/courses/${editing.course.id}`} className="flex min-h-11 items-center text-sm text-accent">
                  Open {editing.course.code ?? editing.course.name}
                </Link>
              )}
              <ActionButton
                action={deleteAssignmentAction.bind(null, editing.id)}
                onSuccess={() => setEditing(null)}
                title={`Delete ${editing.title}`}
                className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm text-danger hover:bg-danger-soft"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </ActionButton>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
