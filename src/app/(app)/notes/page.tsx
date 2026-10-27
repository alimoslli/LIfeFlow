import type { Metadata } from "next";
import Link from "next/link";
import { FileText, FolderKanban, Pin, Search } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SubmitButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { cn, truncate } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listProjects, searchNotes } from "@/server/services/notes";
import { listTasks } from "@/server/services/tasks";
import { createNoteAction, createProjectAction } from "./actions";

export const metadata: Metadata = { title: "Notes" };

const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; course?: string; tag?: string }> }) {
  const sp = await searchParams;
  const projectId = uuid(sp.project);
  const courseId = uuid(sp.course);
  const d = await withCurrentUser(async (s, u) => {
    const [notes, projects] = await series(() => searchNotes(s, { query: sp.q?.slice(0, 200), projectId, courseId, tag: sp.tag?.slice(0, 40) }), () => listProjects(s));
    const projectTasks = projectId ? await listTasks(s, { projectId, status: "open" }) : [];
    return { notes, projects, projectTasks, tz: u.timezone };
  });
  const project = d.projects.find((p) => p.id === projectId);

  return (
    <>
      <PageHeader
        title={project ? project.name : "Notes"}
        eyebrow={project ? "Project" : undefined}
        description={project ? project.description ?? undefined : "Your knowledge base. Link notes to projects and courses; Jarvis can search and organize them."}
        actions={
          <>
            {project && (
              <AskJarvisButton prompt={`Help me turn the "${project.name}" project into a concrete plan with tasks.`} className="h-9 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium hover:border-border-strong">
                Plan with Jarvis
              </AskJarvisButton>
            )}
            <ActionForm action={createNoteAction} className="flex-row">
              <input type="hidden" name="title" value="Untitled note" />
              {projectId && <input type="hidden" name="projectId" value={projectId} />}
              {courseId && <input type="hidden" name="courseId" value={courseId} />}
              <SubmitButton>New note</SubmitButton>
            </ActionForm>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-1">
          <Link href="/notes" className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", !projectId && !courseId ? "bg-surface font-medium shadow-soft" : "text-text-2 hover:bg-surface-2")}>
            <FileText className="h-4 w-4 text-muted" /> All notes
          </Link>
          <p className="mt-4 mb-1 px-2.5 text-xs font-semibold tracking-wide text-muted uppercase">Projects</p>
          {d.projects
            .filter((p) => p.status !== "archived")
            .map((p) => (
              <Link key={p.id} href={`/notes?project=${p.id}`} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", p.id === projectId ? "bg-surface font-medium shadow-soft" : "text-text-2 hover:bg-surface-2")}>
                <FolderKanban className="h-4 w-4 text-muted" />
                <span className="flex-1 truncate">{p.name}</span>
                {p.status !== "active" && <span className="text-[10px] text-muted">{p.status}</span>}
              </Link>
            ))}
          <details className="mt-1 px-2.5">
            <summary className="cursor-pointer text-xs text-accent">New project</summary>
            <ActionForm action={createProjectAction} className="mt-2 gap-2">
              <Input name="name" placeholder="Project name" required className="h-8 text-[13px]" aria-label="Project name" />
              <Input name="description" placeholder="What is it? (optional)" className="h-8 text-[13px]" aria-label="Project description" />
              <SubmitButton size="sm" variant="secondary">
                Create
              </SubmitButton>
            </ActionForm>
          </details>
        </aside>
        <div>
          <form action="/notes" className="relative mb-4">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted" />
            {projectId && <input type="hidden" name="project" value={projectId} />}
            <Input name="q" defaultValue={sp.q} placeholder="Search notes…" className="pl-9" aria-label="Search notes" />
          </form>
          {project && d.projectTasks.length > 0 && (
            <Card className="mb-4 p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Open tasks in this project</p>
              <ul className="flex flex-col gap-1 text-sm">
                {d.projectTasks.map((t) => (
                  <li key={t.id}>• {t.title}</li>
                ))}
              </ul>
            </Card>
          )}
          {d.notes.length === 0 ? (
            <Card>
              <EmptyState icon={<FileText />} title={sp.q ? "No notes match your search" : "No notes yet"}>
                Capture ideas, lecture notes or plans. Ask Jarvis to organize a brain-dump into a project.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.notes.map((n) => (
                <Link key={n.id} href={`/notes/${n.id}`} className="group flex flex-col rounded-3xl bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift">
                  <div className="flex items-start gap-2">
                    <h3 className="flex-1 truncate font-medium group-hover:text-accent">{n.title}</h3>
                    {n.pinned && <Pin className="h-3.5 w-3.5 text-muted" />}
                  </div>
                  <p className="mt-1 line-clamp-3 min-h-[3.75em] text-sm text-text-2">{truncate(n.body.replace(/[#*_>`-]/g, ""), 220) || <span className="text-muted">Empty note</span>}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{formatIn(n.updatedAt, d.tz, "MMM d")}</span>
                    {n.tags.slice(0, 3).map((t) => (
                      <Badge key={t}>#{t}</Badge>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
