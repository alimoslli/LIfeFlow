"use server";
import { redirect } from "next/navigation";
import { formBool, formObject, mutate, type ActionState } from "@/server/actions";
import { createNote, createProject, deleteNote, updateNote, updateProject } from "@/server/services/notes";

const tags = (s?: string) => (s ? [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20) : []);

export async function createNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  let id = "";
  const r = await mutate("note.create", async (s) => {
    id = (await createNote(s, { title: f.title ?? "Untitled", body: "", projectId: f.projectId, courseId: f.courseId })).id;
  });
  if (r?.ok) redirect(`/notes/${id}`);
  return r;
}

export async function saveNoteAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate(
    "note.update",
    async (s) => {
      await updateNote(s, id, { title: f.title ?? "Untitled", body: String(fd.get("body") ?? ""), tags: tags(f.tags), projectId: f.projectId ?? null, courseId: f.courseId ?? null, pinned: formBool(f.pinned) });
      return "Saved";
    },
    { revalidate: ["/notes"] },
  );
}

export async function deleteNoteAction(id: string): Promise<ActionState> {
  const r = await mutate("note.delete", async (s) => {
    await deleteNote(s, id);
  });
  if (r?.ok) redirect("/notes");
  return r;
}

export async function createProjectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("project.create", async (s) => {
    await createProject(s, { name: f.name ?? "", description: f.description });
  });
}

export async function setProjectStatusAction(id: string, status: "active" | "paused" | "completed" | "archived"): Promise<ActionState> {
  return mutate("project.status", async (s) => {
    await updateProject(s, id, { status });
  });
}
