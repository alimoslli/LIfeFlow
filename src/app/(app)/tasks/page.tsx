import { series } from "@/server/db/series";
import type { Metadata } from "next";
import { CheckSquare, ChevronRight, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { TaskCheck } from "@/components/task-check";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, SourceBadge, Tabs } from "@/components/ui/surface";
import { daysBetween, dueLabel, localDateOf, localTimeOf, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { listProjects } from "@/server/services/notes";
import { listCourses } from "@/server/services/school";
import { getTask, listTasks, subtaskCounts } from "@/server/services/tasks";
import { createTaskAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "./actions";

export const metadata: Metadata = { title: "Tasks" };

type Task = Awaited<ReturnType<typeof listTasks>>[number];

const PRIORITY_TONE = { urgent: "danger", high: "warning", medium: "neutral", low: "neutral" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; open?: string }> }) {
  const { view = "open", open } = await searchParams;
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
    const expanded = open ? await getTask(s, open).catch(() => null) : null;
    return { tasks, counts, courses, projects, expanded, tz: user.timezone };
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
      <ActionForm action={createTaskAction} className="mb-6 gap-2">
        <div className="flex items-center gap-2 rounded-full bg-surface p-1.5 pl-5 shadow-soft focus-within:shadow-lift">
          <input
            name="title"
            placeholder="Add a to-do…"
            required
            maxLength={300}
            aria-label="Task title"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] placeholder:text-muted focus:outline-none"
          />
          <SubmitButton size="sm" className="h-9 px-4">
            Add
          </SubmitButton>
        </div>
        <div className="flex gap-2 px-1">
          <label className="flex flex-1 items-center gap-2 text-xs text-muted sm:flex-none">
            Due
            <Input name="dueDate" type="date" aria-label="Due date" className="h-9 rounded-full sm:w-40" defaultValue={view === "today" ? today : undefined} />
          </label>
          <Select name="priority" aria-label="Priority" defaultValue="medium" className="h-9 w-32 rounded-full">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
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
            Add a task above, or ask Jarvis: “Add all my assignments and organize them by deadline.”
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key}>
                {g.label && (
                  <h2 className={cn("mb-2 text-[15px] font-semibold", g.key === "overdue" ? "text-danger" : "text-text")}>
                    {g.label} <span className="font-normal text-muted">{g.items.length}</span>
                  </h2>
                )}
                <Card as="div" className="divide-y divide-border">
                  {g.items.map((t) => {
                    const due = dueLabel(t.dueAt, t.dueAllDay, tz);
                    const c = data.counts.get(t.id);
                    const isOpen = data.expanded?.id === t.id;
                    return (
                      <div key={t.id}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <TaskCheck
                            done={t.status === "done"}
                            action={toggleTaskAction.bind(null, t.id)}
                            label={`Mark "${t.title}" ${t.status === "done" ? "not done" : "done"}`}
                          />
                          <a href={isOpen ? `/tasks?view=${view}` : `/tasks?view=${view}&open=${t.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                            <span className={cn("truncate text-sm", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                            {c && (
                              <span className="shrink-0 text-xs text-muted">
                                {c.done}/{c.total}
                              </span>
                            )}
                          </a>
                          <div className="flex shrink-0 items-center gap-2">
                            {t.courseId && courseName.get(t.courseId) && <Badge tone="info">{courseName.get(t.courseId)}</Badge>}
                            {t.projectId && projectName.get(t.projectId) && <Badge>{projectName.get(t.projectId)}</Badge>}
                            {t.priority !== "medium" && t.priority !== "low" && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
                            {due.text && (
                              <span className={cn("hidden text-xs sm:inline", due.overdue && t.status !== "done" ? "text-danger" : "text-muted")}>
                                {due.text}
                              </span>
                            )}
                            <ChevronRight className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-90")} />
                          </div>
                        </div>
                        {isOpen && data.expanded && <TaskDetail task={data.expanded} tz={tz} courses={data.courses} projects={data.projects} />}
                      </div>
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

function TaskDetail({
  task,
  tz,
  courses,
  projects,
}: {
  task: Awaited<ReturnType<typeof getTask>>;
  tz: string;
  courses: { id: string; name: string; code: string | null }[];
  projects: { id: string; name: string }[];
}) {
  return (
    <div className="animate-fade-in grid gap-6 border-t border-border bg-surface-2/50 px-4 py-4 sm:grid-cols-[1.4fr_1fr] sm:px-11">
      <ActionForm action={updateTaskAction.bind(null, task.id)} reset={false} className="gap-3">
        <Field label="Title" htmlFor={`title-${task.id}`}>
          <Input id={`title-${task.id}`} name="title" defaultValue={task.title} required />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Due date" htmlFor={`d-${task.id}`}>
            <Input id={`d-${task.id}`} name="dueDate" type="date" defaultValue={task.dueAt ? localDateOf(task.dueAt, tz) : ""} />
          </Field>
          <Field label="Time" htmlFor={`t-${task.id}`}>
            <Input id={`t-${task.id}`} name="dueTime" type="time" defaultValue={task.dueAt && !task.dueAllDay ? localTimeOf(task.dueAt, tz) : ""} />
          </Field>
          <Field label="Priority" htmlFor={`p-${task.id}`}>
            <Select id={`p-${task.id}`} name="priority" defaultValue={task.priority}>
              {["low", "medium", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Course" htmlFor={`c-${task.id}`}>
            <Select id={`c-${task.id}`} name="courseId" defaultValue={task.courseId ?? ""}>
              <option value="">None</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project" htmlFor={`pr-${task.id}`}>
            <Select id={`pr-${task.id}`} name="projectId" defaultValue={task.projectId ?? ""}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor={`n-${task.id}`}>
          <Textarea id={`n-${task.id}`} name="notes" defaultValue={task.notes ?? ""} rows={3} />
        </Field>
        <div className="flex items-center gap-2">
          <SubmitButton size="sm">Save changes</SubmitButton>
          <SourceBadge source={task.source} />
          <span className="ml-auto">
            <ActionButton
              action={deleteTaskAction.bind(null, task.id)}
              confirm={`Delete "${task.title}"?`}
              title="Delete task"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-danger-soft"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ActionButton>
          </span>
        </div>
      </ActionForm>
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Subtasks</h3>
        <ul className="mb-2 flex flex-col gap-1.5">
          {task.subtasks.map((st) => (
            <li key={st.id} className="flex items-center gap-2.5 text-sm">
              <TaskCheck done={st.status === "done"} action={toggleTaskAction.bind(null, st.id)} label={`Toggle ${st.title}`} />
              <span className={cn(st.status === "done" && "text-muted line-through")}>{st.title}</span>
            </li>
          ))}
          {!task.subtasks.length && <li className="text-sm text-muted">No subtasks yet.</li>}
        </ul>
        <ActionForm action={createTaskAction} className="flex-row gap-2">
          <input type="hidden" name="parentId" value={task.id} />
          <Input name="title" placeholder="Add subtask" required className="h-8 text-[13px]" aria-label="Subtask title" />
          <SubmitButton size="sm" variant="secondary">
            Add
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
