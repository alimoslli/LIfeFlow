"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Markdown } from "@/components/jarvis/markdown";
import { SubmitButton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

type Opt = { id: string; name: string };

export function NoteEditor({
  action,
  note,
  projects,
  courses,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  note: { title: string; body: string; tags: string[]; projectId: string | null; courseId: string | null; pinned: boolean };
  projects: Opt[];
  courses: Opt[];
}) {
  const [body, setBody] = useState(note.body);
  const [preview, setPreview] = useState(false);
  return (
    <ActionForm action={action} reset={false} showSuccess className="gap-4">
      <input name="title" defaultValue={note.title} required aria-label="Title" className="w-full bg-transparent font-display text-[32px] leading-tight font-medium tracking-tight focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="projectId" defaultValue={note.projectId ?? ""} className="h-8 w-auto text-[13px]" aria-label="Project">
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="courseId" defaultValue={note.courseId ?? ""} className="h-8 w-auto text-[13px]" aria-label="Course">
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input name="tags" defaultValue={note.tags.join(", ")} placeholder="tags, comma separated" className="h-8 w-56 text-[13px]" aria-label="Tags" />
        <label className="flex items-center gap-1.5 text-xs text-text-2">
          <input type="checkbox" name="pinned" defaultChecked={note.pinned} className="accent-[var(--accent)]" /> Pinned
        </label>
        <div className="ml-auto flex rounded-full bg-surface-2 p-0.5 text-xs">
          <button type="button" onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ${!preview ? "bg-surface-2 font-medium" : "text-muted"}`}>
            Write
          </button>
          <button type="button" onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ${preview ? "bg-surface-2 font-medium" : "text-muted"}`}>
            Preview
          </button>
        </div>
      </div>
      <input type="hidden" name="body" value={body} />
      {preview ? (
        <div className="min-h-80 rounded-3xl bg-surface shadow-soft p-5">{body.trim() ? <Markdown text={body} /> : <p className="text-sm text-muted">Nothing to preview.</p>}</div>
      ) : (
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} placeholder="Start writing… Markdown supported." className="min-h-80 font-[450] leading-relaxed" aria-label="Note body" />
      )}
      <SubmitButton className="self-start">Save note</SubmitButton>
    </ActionForm>
  );
}
