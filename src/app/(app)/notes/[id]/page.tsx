import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SourceBadge } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { getNote, listProjects } from "@/server/services/notes";
import { listCourses } from "@/server/services/school";
import { deleteNoteAction, saveNoteAction } from "../actions";
import { NoteEditor } from "./editor";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await withCurrentUser(async (s, u) => {
    const note = await getNote(s, id).catch(() => null);
    if (!note) return null;
    const [projects, courses] = await series(
      () => listProjects(s),
      () => listCourses(s),
    );
    return { note, projects, courses, tz: u.timezone };
  });
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={d.note.projectId ? `/notes?project=${d.note.projectId}` : "/notes"}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Notes
        </Link>
        <div className="flex items-center gap-3 text-xs text-muted">
          <SourceBadge source={d.note.source} />
          <span>Edited {formatIn(d.note.updatedAt, d.tz, "MMM d, h:mm a")}</span>
          <AskJarvisButton prompt={`Turn my note "${d.note.title}" into an action plan with tasks.`} className="font-medium text-accent hover:underline">
            Make a plan
          </AskJarvisButton>
          <ActionButton
            action={deleteNoteAction.bind(null, d.note.id)}
            confirm="Delete this note?"
            title="Delete note"
            className="text-muted hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>
      <NoteEditor
        action={saveNoteAction.bind(null, d.note.id)}
        note={d.note}
        projects={d.projects.map((p) => ({ id: p.id, name: p.name }))}
        courses={d.courses.map((c) => ({ id: c.id, name: c.code ? `${c.code} · ${c.name}` : c.name }))}
      />
    </div>
  );
}
