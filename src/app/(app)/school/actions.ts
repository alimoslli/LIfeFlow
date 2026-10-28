"use server";
import { trashAction } from "../trash-actions";
import { redirect } from "next/navigation";
import { formNum, formObject, mutate, type ActionState } from "@/server/actions";
import { ServiceError } from "@/server/services/errors";
import { addMaterial, createAssignment, createCourse, deleteMaterial, getAssignment, updateAssignment, updateCourse } from "@/server/services/school";

const courseFields = (f: Record<string, string | undefined>) => ({
  name: f.name ?? "",
  code: f.code ?? null,
  term: f.term ?? null,
  instructorName: f.instructorName ?? null,
  instructorEmail: f.instructorEmail ?? null,
  location: f.location ?? null,
  meetingInfo: f.meetingInfo ?? null,
  url: f.url ?? null,
});

export async function createCourseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("course.create", async (s) => {
    const c = await createCourse(s, courseFields(f));
    return `Added ${c.name}`;
  });
}

export async function updateCourseAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("course.update", async (s) => {
    await updateCourse(s, id, courseFields(f));
  });
}

export async function deleteCourseAction(id: string): Promise<ActionState> {
  const r = await trashAction("course", id);
  if (r?.ok) redirect(`/school?undo=${r.undo}`);
  return r;
}

export async function createAssignmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("assignment.create", async (s, u) => {
    const r = await createAssignment(s, u.timezone, {
      courseId: f.courseId ?? "",
      title: f.title ?? "",
      kind: (f.kind as "assignment") ?? "assignment",
      dueDate: f.dueDate,
      dueTime: f.dueTime,
      description: f.description,
      url: f.url,
      pointsPossible: formNum(f.pointsPossible),
    });
    if (r.status === "duplicate") throw new ServiceError("That assignment already exists for this course and date.", "conflict");
  });
}

export async function toggleAssignmentAction(id: string): Promise<ActionState> {
  return mutate("assignment.toggle", async (s, u) => {
    const a = await getAssignment(s, id);
    await updateAssignment(s, u.timezone, id, { status: a.status === "done" ? "todo" : "done" });
  });
}

export async function updateAssignmentAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("assignment.update", async (s, u) => {
    await updateAssignment(s, u.timezone, id, {
      title: f.title,
      kind: f.kind as "assignment",
      dueDate: f.dueDate ?? null,
      dueTime: f.dueTime,
      description: f.description ?? null,
      url: f.url ?? null,
      grade: f.grade ?? null,
    });
  });
}

export async function deleteAssignmentAction(id: string): Promise<ActionState> {
  return trashAction("assignment", id);
}

export async function addMaterialAction(courseId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("material.create", async (s) => {
    await addMaterial(s, { courseId, title: f.title ?? "", url: f.url, module: f.module });
  });
}

export async function deleteMaterialAction(id: string): Promise<ActionState> {
  return mutate("material.delete", async (s) => {
    await deleteMaterial(s, id);
  });
}
