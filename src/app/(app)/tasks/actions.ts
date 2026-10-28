"use server";
import { redirect } from "next/navigation";
import { trashAction } from "../trash-actions";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { formatDateStr, localDateOf } from "@/lib/dates";
import { createTask, getTask, TASK_REPEATS, updateTask, type ReminderKey } from "@/server/services/tasks";

const repeatOf = (v: string | undefined) => TASK_REPEATS.find((r) => r === v) ?? null;
const reminderOf = (v: string | undefined) => (["none", "at_time", "15m", "1h", "1d"].includes(v ?? "") ? (v as ReminderKey) : undefined);

export async function createTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("task.create", async (s, u) => {
    const t = await createTask(s, u.timezone, {
      title: f.title ?? "",
      notes: f.notes,
      priority: (f.priority as "medium") ?? "medium",
      dueDate: f.dueDate,
      dueTime: f.dueTime,
      parentId: f.parentId,
      courseId: f.courseId,
      projectId: f.projectId,
      repeat: repeatOf(f.repeat),
      reminder: reminderOf(f.reminder),
    });
    return f.parentId ? "Subtask added." : `Added "${t.title}"${t.dueAt ? ` for ${formatDateStr(localDateOf(t.dueAt, u.timezone), "EEE, MMM d")}` : ""}.`;
  });
}

export async function updateTaskAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("task.update", async (s, u) => {
    await updateTask(s, u.timezone, id, {
      title: f.title,
      notes: f.notes ?? null,
      priority: f.priority as "medium",
      dueDate: f.dueDate ?? null,
      dueTime: f.dueTime,
      courseId: f.courseId ?? null,
      projectId: f.projectId ?? null,
      repeat: repeatOf(f.repeat),
      reminder: reminderOf(f.reminder) ?? "none",
    });
    return "To-do saved.";
  });
}

export async function toggleTaskAction(id: string): Promise<ActionState> {
  return mutate("task.toggle", async (s, u) => {
    const t = await getTask(s, id);
    const done = t.status !== "done";
    const r = await updateTask(s, u.timezone, id, { status: done ? "done" : "todo" });
    if (!done) return `"${t.title}" is open again.`;
    return r.next?.dueAt ? `Done. Next one is ${formatDateStr(localDateOf(r.next.dueAt, u.timezone), "EEE, MMM d")}.` : `Done: ${t.title}.`;
  });
}

export async function deleteTaskAction(id: string): Promise<ActionState> {
  return trashAction("task", id);
}

/** From the to-do's own page: delete, then go back to the list with Undo. */
export async function deleteTaskAndLeaveAction(id: string): Promise<ActionState> {
  const r = await trashAction("task", id);
  if (r?.ok) redirect(`/tasks?undo=${r.undo}`);
  return r;
}
