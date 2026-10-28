"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Markdown } from "@/components/jarvis/markdown";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
      <input
        name="title"
        defaultValue={note.title}
        required
        aria-label="Title"
        maxLength={300}
        className="w-full bg-transparent font-display text-[28px] leading-tight font-medium tracking-tight focus:outline-none sm:text-[32px]"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Project" htmlFor="note-project">
          <Select id="note-project" name="projectId" defaultValue={note.projectId ?? ""} className="h-11">
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="note-course">
          <Select id="note-course" name="courseId" defaultValue={note.courseId ?? ""} className="h-11">
            <option value="">No class</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="note-tags">
          <Input id="note-tags" name="tags" defaultValue={note.tags.join(", ")} placeholder="e.g. ideas, business" className="h-11" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" name="pinned" defaultChecked={note.pinned} className="lf-switch" /> Pin to the top
        </label>
        <div role="tablist" aria-label="Write or preview" className="flex rounded-full bg-surface-2 p-1 text-sm">
          <button
            type="button"
            role="tab"
            aria-selected={!preview}
            onClick={() => setPreview(false)}
            className={`min-h-10 rounded-full px-4 ${!preview ? "bg-surface font-medium shadow-soft" : "text-muted"}`}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preview}
            onClick={() => setPreview(true)}
            className={`min-h-10 rounded-full px-4 ${preview ? "bg-surface font-medium shadow-soft" : "text-muted"}`}
          >
            Preview
          </button>
        </div>
      </div>
      <input type="hidden" name="body" value={body} />
      {preview ? (
        <div className="min-h-80 rounded-3xl bg-surface shadow-soft p-5">
          {body.trim() ? <Markdown text={body} /> : <p className="text-sm text-muted">Nothing to preview.</p>}
        </div>
      ) : (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          placeholder="Start writing… Markdown supported."
          className="min-h-80 font-[450] leading-relaxed"
          aria-label="Note body"
        />
      )}
      <SubmitButton className="self-start max-sm:h-12 max-sm:w-full">Save note</SubmitButton>
    </ActionForm>
  );
}
