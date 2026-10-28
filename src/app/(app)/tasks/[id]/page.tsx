import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { TaskCheck } from "@/components/task-check";
import { SubmitButton } from "@/components/ui/button";
import { CountedInput } from "@/components/ui/counted-input";
import { Field, Select } from "@/components/ui/field";
import { DateField, PriorityField, TimeField } from "@/components/ui/pickers";
import { SourceBadge } from "@/components/ui/surface";
import { localDateOf, localTimeOf, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listProjects } from "@/server/services/notes";
import { listCourses } from "@/server/services/school";
import { getTask, reminderKeyOf } from "@/server/services/tasks";
import { createTaskAction, deleteTaskAndLeaveAction, toggleTaskAction, updateTaskAction } from "../actions";

export const metadata: Metadata = { title: "To-do" };

const REPEAT_LABEL = {
  "": "Doesn't repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
};
const REMINDER_LABEL = { none: "No reminder", at_time: "At the due time", "15m": "15 minutes before", "1h": "1 hour before", "1d": "1 day before" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await withCurrentUser(async (s, u) => {
    const task = await getTask(s, id).catch(() => null);
    if (!task) return null;
    const [courses, projects] = await series(
      () => listCourses(s),
      () => listProjects(s),
    );
    return { task, courses, projects, tz: u.timezone, today: todayIn(u.timezone) };
  });
  if (!d) notFound();
  const { task, tz } = d;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <Link href="/tasks" className="hidden items-center gap-1 text-sm text-muted hover:text-text md:inline-flex">
        <ArrowLeft className="h-3.5 w-3.5" /> To-dos
      </Link>
      <div className="flex items-start gap-3">
        <div className="pt-2">
          <TaskCheck
            done={task.status === "done"}
            action={toggleTaskAction.bind(null, task.id)}
            label={`Mark "${task.title}" ${task.status === "done" ? "not done" : "done"}`}
          />
        </div>
        <h1 className={cn("font-display text-[28px] leading-tight font-medium break-words", task.status === "done" && "text-muted line-through")}>
          {task.title}
        </h1>
      </div>

      <ActionForm action={updateTaskAction.bind(null, task.id)} reset={false} className="gap-4">
        <Field label="Title" htmlFor="t-title">
          <CountedInput id="t-title" name="title" defaultValue={task.title} required max={300} multiline rows={2} />
        </Field>
        <DateField name="dueDate" label="Due" today={d.today} defaultValue={task.dueAt ? localDateOf(task.dueAt, tz) : ""} />
        <TimeField name="dueTime" label="Time" defaultValue={task.dueAt && !task.dueAllDay ? localTimeOf(task.dueAt, tz) : ""} />
        <PriorityField name="priority" defaultValue={task.priority} />
        <Field label="Repeats" htmlFor="t-repeat" hint="Needs a due date. Completing it creates the next one.">
          <Select id="t-repeat" name="repeat" defaultValue={task.repeat ?? ""} className="h-12 text-[16px]">
            {Object.entries(REPEAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reminder" htmlFor="t-remind" hint="Sent as a notification when they're turned on in Settings.">
          <Select id="t-remind" name="reminder" defaultValue={reminderKeyOf(task, tz)} className="h-12 text-[16px]">
            {Object.entries(REMINDER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="t-course">
          <Select id="t-course" name="courseId" defaultValue={task.courseId ?? ""} className="h-12 text-[16px]">
            <option value="">None</option>
            {d.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Project" htmlFor="t-project">
          <Select id="t-project" name="projectId" defaultValue={task.projectId ?? ""} className="h-12 text-[16px]">
            <option value="">None</option>
            {d.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="t-notes">
          <CountedInput id="t-notes" name="notes" defaultValue={task.notes ?? ""} max={5000} multiline rows={4} />
        </Field>
        <SubmitButton className="h-12 w-full text-[15px]">Save changes</SubmitButton>
      </ActionForm>

      <section aria-label="Subtasks" className="rounded-3xl bg-surface p-5 shadow-soft">
        <h2 className="mb-2 text-[15px] font-semibold">Subtasks</h2>
        <ul className="mb-3 flex flex-col">
          {task.subtasks.map((st) => (
            <li key={st.id} className="flex min-h-12 items-center gap-3 text-[15px]">
              <TaskCheck done={st.status === "done"} action={toggleTaskAction.bind(null, st.id)} label={`Toggle ${st.title}`} />
              <span className={cn("min-w-0 flex-1 break-words", st.status === "done" && "text-muted line-through")}>{st.title}</span>
            </li>
          ))}
          {!task.subtasks.length && <li className="text-sm text-muted">Break it into small steps.</li>}
        </ul>
        <ActionForm action={createTaskAction} className="flex-row items-start gap-2">
          <input type="hidden" name="parentId" value={task.id} />
          <CountedInput
            name="title"
            placeholder="Add a subtask"
            required
            max={300}
            aria-label="Subtask title"
            className="h-12 w-full rounded-full border border-border bg-surface px-4 text-[16px] focus:border-accent focus:outline-none"
          />
          <SubmitButton variant="secondary" className="h-12 min-w-16 shrink-0 px-5">
            Add
          </SubmitButton>
        </ActionForm>
      </section>

      <div className="flex items-center justify-between gap-3">
        <SourceBadge source={task.source} />
        <ActionButton
          action={deleteTaskAndLeaveAction.bind(null, task.id)}
          title={`Delete ${task.title}`}
          className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm text-danger hover:bg-danger-soft"
        >
          <Trash2 className="h-4 w-4" /> Delete to-do
        </ActionButton>
      </div>
    </div>
  );
}
