import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, GraduationCap, Plug, Sparkles } from "lucide-react";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui/surface";
import { dueLabel } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { integrationStatus } from "@/server/services/integrations";
import { listAssignments, listCourses, type AssignmentView } from "@/server/services/school";
import { createAssignmentAction, createCourseAction } from "./actions";
import { AssignmentList } from "./assignment-list";
import { AssignmentDialog, CourseDialog } from "./forms";

export const metadata: Metadata = { title: "School" };

const VIEWS: { key: AssignmentView; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? "upcoming") as AssignmentView;
  const d = await withCurrentUser(async (s, u) => {
    const [courses, list, all, integrations] = await series(
      () => listCourses(s),
      () => listAssignments(s, u.timezone, { view }),
      () => listAssignments(s, u.timezone, { view: "upcoming", limit: 300 }),
      () => integrationStatus(s),
    );
    return { courses, list, all, canvas: integrations.find((i) => i.provider === "canvas")!, tz: u.timezone };
  });
  const nextByCourse = new Map<string, (typeof d.all)[number]>();
  for (const a of d.all) if (!nextByCourse.has(a.course.id)) nextByCourse.set(a.course.id, a);
  const openCount = new Map<string, number>();
  for (const a of d.all) openCount.set(a.course.id, (openCount.get(a.course.id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="School"
        description="Your classes and what's due."
        actions={
          <>
            {d.courses.length > 0 && <AssignmentDialog action={createAssignmentAction} courses={d.courses} />}
            <CourseDialog action={createCourseAction} trigger="Add course" />
          </>
        }
      />

      {d.courses.length === 0 ? (
        <Card className="mb-8">
          <EmptyState icon={<GraduationCap />} title="Add your first course" action={<CourseDialog action={createCourseAction} trigger="Add course" />}>
            Or tell Jarvis: “I&apos;m taking PSY 101, BIO 110 and MATH 152 this semester.”
          </EmptyState>
        </Card>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.courses.map((c) => {
            const next = nextByCourse.get(c.id);
            const due = next ? dueLabel(next.dueAt, next.dueAllDay, d.tz) : null;
            return (
              <Link key={c.id} href={`/school/courses/${c.id}`} className="group rounded-3xl bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted">{c.code ?? "Course"}</p>
                    <p className="truncate font-medium group-hover:text-accent">{c.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{[c.instructorName, c.meetingInfo].filter(Boolean).join(" · ") || " "}</p>
                  </div>
                  {openCount.get(c.id) ? <Badge>{openCount.get(c.id)} open</Badge> : null}
                </div>
                <div className="mt-3 border-t border-border pt-3 text-xs">
                  {next ? (
                    <p className="truncate">
                      <span className="text-muted">Next: </span>
                      {next.title} <span className={due?.overdue ? "text-danger" : "text-muted"}>· {due?.text}</span>
                    </p>
                  ) : (
                    <p className="text-muted">Nothing upcoming</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AskJarvisButton
        prompt="I'm going to paste my assignments. Please add them to the right courses: "
        className="mb-10 flex w-full items-center gap-3 rounded-3xl bg-accent-soft px-5 py-4 text-left text-[15px] text-accent transition-transform active:scale-[0.99]"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">Have a syllabus or a screenshot? Send it to Jarvis and it&apos;ll add everything.</span>
      </AskJarvisButton>

      <h2 className="mb-3 font-display text-2xl font-medium">Assignments</h2>
      <Tabs current={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: `/school?view=${v.key}` }))} />
      <Card className="mb-10">
        {d.list.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={view === "overdue" ? "Nothing overdue. Nice." : "Nothing here"}>
            {view === "completed" ? "Completed assignments will collect here." : "Assignments you or Jarvis add will show up here."}
          </EmptyState>
        ) : (
          <AssignmentList items={d.list} tz={d.tz} />
        )}
      </Card>

      {/* Integrations live below the primary academic content. */}
      <Card>
        <CardHeader title="Canvas connection" action={<Badge tone="neutral">Not connected</Badge>} />
        <div className="flex flex-col gap-3 px-5 pb-5 text-sm text-text-2 sm:flex-row sm:items-center">
          <Plug className="hidden h-5 w-5 shrink-0 text-muted sm:block" />
          <p className="flex-1">
            Canvas sync isn&apos;t available in this version yet. It needs your school&apos;s Canvas URL and an access token your school permits. Until then,
            add work manually or paste it into your assistant. Nothing here is synced or simulated.
          </p>
          <Link href="/settings/integrations" className="shrink-0 text-sm font-medium text-accent hover:underline">
            Integration details
          </Link>
        </div>
        {d.canvas.connections.length > 0 && <p className="px-5 pb-4 text-xs text-muted">{d.canvas.connections.length} connection record(s) on file.</p>}
      </Card>
    </>
  );
}
