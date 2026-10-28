import { series } from "@/server/db/series";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckSquare, ChevronRight, Repeat } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SwipeRow } from "@/components/swipe-row";
import { TaskCheck } from "@/components/task-check";
import { SubmitButton } from "@/components/ui/button";
import { CountedInput } from "@/components/ui/counted-input";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui/surface";
import { daysBetween, dueLabel, localDateOf, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { listProjects } from "@/server/services/notes";
import { listCourses } from "@/server/services/school";
import { listTasks, subtaskCounts } from "@/server/services/tasks";
import { createTaskAction, deleteTaskAction, toggleTaskAction } from "./actions";

export const metadata: Metadata = { title: "To-dos" };

type Task = Awaited<ReturnType<typeof listTasks>>[number];

const PRIORITY_TONE = { urgent: "danger", high: "warning", medium: "neutral", low: "neutral" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; open?: string }> }) {
  const { view = "open", open } = await searchParams;
  if (open) redirect(`/tasks/${open}`);
  const data = await withCurrentUser(async (s, user) => {
    const status = view === "done" ? "done" : "open";
    const tasks = await listTasks(s, { status, topLevelOnly: true, limit: 300 });
    const counts = await subtaskCounts(
      s,
      tasks.map((t) => t.id),
    );
    const [courses, projects] = await series(
      () => listCourses(s),
      () => listProjects(s),
    );
    return { tasks, counts, courses, projects, tz: user.timezone };
  });
  const { tz } = data;
  const today = todayIn(tz);
  const local = (t: Task) => (t.dueAt ? localDateOf(t.dueAt, tz) : null);

  let tasks = data.tasks;
  if (view === "today") tasks = tasks.filter((t) => local(t) && local(t)! <= today);
  if (view === "upcoming") tasks = tasks.filter((t) => local(t) && local(t)! > today);

  const groups: { key: string; label: string; items: Task[] }[] =
    view === "open"
      ? [
          { key: "overdue", label: "Overdue", items: tasks.filter((t) => local(t) && local(t)! < today) },
          { key: "today", label: "Today", items: tasks.filter((t) => local(t) === today) },
          { key: "week", label: "Next 7 days", items: tasks.filter((t) => local(t) && local(t)! > today && daysBetween(today, local(t)!) <= 7) },
          { key: "later", label: "Later", items: tasks.filter((t) => local(t) && daysBetween(today, local(t)!) > 7) },
          { key: "none", label: "No due date", items: tasks.filter((t) => !t.dueAt) },
        ]
      : [{ key: "all", label: "", items: tasks }];

  const courseName = new Map(data.courses.map((c) => [c.id, c.code ?? c.name]));
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="To-dos" />
      <ActionForm action={createTaskAction} className="mb-6 hidden gap-2 md:flex">
        <div className="flex items-center gap-2 rounded-full bg-surface p-1.5 pl-5 shadow-soft focus-within:shadow-lift">
          <CountedInput
            name="title"
            placeholder="Add a to-do…"
            required
            max={300}
            aria-label="To-do title"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] placeholder:text-muted focus:outline-none"
          />
          <SubmitButton size="sm" className="h-9 px-4">
            Add
          </SubmitButton>
        </div>
      </ActionForm>

      <Tabs
        current={view}
        items={[
          { key: "open", label: "Open", href: "/tasks" },
          { key: "today", label: "Today", href: "/tasks?view=today" },
          { key: "upcoming", label: "Upcoming", href: "/tasks?view=upcoming" },
          { key: "done", label: "Done", href: "/tasks?view=done" },
        ]}
      />

      {tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckSquare />} title={view === "done" ? "Nothing completed yet" : "You're all caught up"}>
            Tap + to add a to-do, or ask Jarvis: “Add all my assignments and organize them by deadline.”
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="-mt-3 text-xs text-muted md:hidden">Swipe right to complete, left to delete.</p>
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key}>
                {g.label && (
                  <h2 className={cn("mb-2 text-[15px] font-semibold", g.key === "overdue" ? "text-danger" : "text-text")}>
                    {g.label} <span className="font-normal text-muted">{g.items.length}</span>
                  </h2>
                )}
                <Card as="div" className="divide-y divide-border overflow-hidden">
                  {g.items.map((t) => {
                    const due = dueLabel(t.dueAt, t.dueAllDay, tz);
                    const c = data.counts.get(t.id);
                    const meta = [
                      due.text || null,
                      t.courseId ? (courseName.get(t.courseId) ?? null) : null,
                      t.projectId ? (projectName.get(t.projectId) ?? null) : null,
                      c ? `${c.done}/${c.total} subtasks` : null,
                    ].filter((x): x is string => !!x);
                    return (
                      <SwipeRow
                        key={t.id}
                        done={t.status === "done"}
                        onComplete={toggleTaskAction.bind(null, t.id)}
                        onDelete={deleteTaskAction.bind(null, t.id)}
                      >
                        <div className="flex items-center gap-3 px-4 py-2">
                          <TaskCheck
                            done={t.status === "done"}
                            action={toggleTaskAction.bind(null, t.id)}
                            label={`Mark "${t.title}" ${t.status === "done" ? "not done" : "done"}`}
                          />
                          <Link href={`/tasks/${t.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1">
                              <span className={cn("line-clamp-2 text-[15px]", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                              {meta.length > 0 && (
                                <span
                                  className={cn(
                                    "mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs",
                                    due.overdue && t.status !== "done" ? "text-danger" : "text-muted",
                                  )}
                                >
                                  {t.repeat && <Repeat className="h-3 w-3" aria-label="Repeats" />}
                                  {meta.join(" · ")}
                                </span>
                              )}
                            </span>
                            {t.priority !== "medium" && t.priority !== "low" && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                          </Link>
                        </div>
                      </SwipeRow>
                    );
                  })}
                </Card>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
