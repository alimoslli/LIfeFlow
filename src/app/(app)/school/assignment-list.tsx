import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { TaskCheck } from "@/components/task-check";
import { Badge, SourceBadge } from "@/components/ui/surface";
import { dueLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { listAssignments } from "@/server/services/school";
import { toggleAssignmentAction } from "./actions";

type A = Awaited<ReturnType<typeof listAssignments>>[number];

const KIND_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = { exam: "danger", quiz: "warning", project: "info" };

export function AssignmentList({ items, tz, showCourse = true }: { items: A[]; tz: string; showCourse?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const due = dueLabel(a.dueAt, a.dueAllDay, tz);
        const done = a.status === "done";
        return (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3" data-testid="assignment-row">
            <TaskCheck done={done} action={toggleAssignmentAction.bind(null, a.id)} label={`Mark ${a.title} ${done ? "not done" : "done"}`} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", done && "text-muted line-through")}>{a.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {showCourse && (
                  <Link href={`/school/courses/${a.course.id}`} className="flex items-center gap-1.5 hover:text-text">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.course.color ?? "var(--accent)" }} />
                    {a.course.code ?? a.course.name}
                  </Link>
                )}
                {a.source !== "manual" && <SourceBadge source={a.source} />}
              </div>
            </div>
            {a.kind !== "assignment" && <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind}</Badge>}
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text" aria-label="Open original">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <span className={cn("w-28 shrink-0 text-right text-xs", !done && due.overdue ? "font-medium text-danger" : !done && due.soon ? "text-warning" : "text-muted")}>{due.text || "No due date"}</span>
          </li>
        );
      })}
    </ul>
  );
}
