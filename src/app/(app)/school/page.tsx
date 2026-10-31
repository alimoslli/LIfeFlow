import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Sparkles } from "lucide-react";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { dueLabel } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAssignments, listCourses } from "@/server/services/school";
import { createAssignmentAction, createCourseAction } from "./actions";
import { AssignmentDialog, CourseDialog } from "./forms";
import { canvasConnection } from "@/server/integrations/canvas";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage() {
  const d = await withCurrentUser(async (s, u) => {
    const [courses, all, canvas] = await series(
      () => listCourses(s),
      () => listAssignments(s, u.timezone, { view: "upcoming", limit: 300 }),
      () => canvasConnection(s),
    );
    return { courses, all, canvas, tz: u.timezone };
  });
  const nextByCourse = new Map<string, (typeof d.all)[number]>();
  for (const a of d.all) if (!nextByCourse.has(a.course.id)) nextByCourse.set(a.course.id, a);
  const openCount = new Map<string, number>();
  for (const a of d.all) openCount.set(a.course.id, (openCount.get(a.course.id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Classes"
        description="Your classes and what's next in each."
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
                    <p className="line-clamp-2 break-words font-medium group-hover:text-accent">{c.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{[c.instructorName, c.meetingInfo].filter(Boolean).join(" · ") || " "}</p>
                  </div>
                  {openCount.get(c.id) ? <Badge>{openCount.get(c.id)} open</Badge> : null}
                </div>
                <div className="mt-3 border-t border-border pt-3 text-xs">
                  {next ? (
                    <p className="line-clamp-2 break-words">
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
        prompt="Here's my syllabus. Add every due date and exam to the right class."
        className="mb-4 flex w-full items-center gap-3 rounded-3xl bg-accent-soft px-5 py-4 text-left text-[15px] text-accent transition-transform active:scale-[0.99]"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">Have a syllabus or a screenshot? Send it to Jarvis and it&apos;ll add everything.</span>
      </AskJarvisButton>
      {!d.canvas && (
        <Link href="/settings/integrations" className="mb-6 flex min-h-11 items-center text-sm font-medium text-accent">
          Use Canvas? Connect it and your classes and due dates fill in by themselves.
        </Link>
      )}
    </>
  );
}
