"use server";
import { trashAction } from "../trash-actions";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { createTask, getTask, updateTask } from "@/server/services/tasks";

export async function createTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("task.create", async (s, u) => {
    await createTask(s, u.timezone, {
      title: f.title ?? "",
      notes: f.notes,
      priority: (f.priority as "medium") ?? "medium",
      dueDate: f.dueDate,
      dueTime: f.dueTime,
      parentId: f.parentId,
      courseId: f.courseId,
      projectId: f.projectId,
    });
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
    });
  });
}

export async function toggleTaskAction(id: string): Promise<ActionState> {
  return mutate("task.toggle", async (s, u) => {
    const t = await getTask(s, id);
    await updateTask(s, u.timezone, id, { status: t.status === "done" ? "todo" : "done" });
  });
}

export async function deleteTaskAction(id: string): Promise<ActionState> {
  return trashAction("task", id);
}
