import { AssistantName } from "@/components/assistant-name";
import type { Metadata } from "next";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { MySkyling } from "@/components/skylings/sprite";
import { BOOKS, PixelArt, SkyWindow } from "@/components/skylings/sky-window";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { dueLabel } from "@/lib/dates";
import { twelveHourRanges } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAssignments, listCourses, type AssignmentView } from "@/server/services/school";
import { DUE_VIEWS, DueList } from "./due-list";
import { ActionButton } from "@/components/action-form";
import { createAssignmentAction, createCourseAction, mergeDuplicateClassesAction } from "./actions";
import { AssignmentDialog, CourseDialog } from "./forms";
import { canvasConnection } from "@/server/integrations/canvas";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  // What's due is a section of this page (the Due page was folded in, owner's page map 2026-11-10): this week by default.
  const view = (DUE_VIEWS.find((v) => v.key === sp.view)?.key ?? "week") as AssignmentView;
  const d = await withCurrentUser(async (s, u) => {
    const [courses, all, canvas, due] = await series(
      () => listCourses(s),
      () => listAssignments(s, u.timezone, { view: "upcoming", limit: 300 }),
      () => canvasConnection(s),
      () => listAssignments(s, u.timezone, { view }),
    );
    return { courses, all, canvas, due, tz: u.timezone };
  });
  const nextByCourse = new Map<string, (typeof d.all)[number]>();
  for (const a of d.all) if (!nextByCourse.has(a.course.id)) nextByCourse.set(a.course.id, a);
  // The same class listed twice (same code, or same name): offer one tap to fold them together.
  const seenKeys = new Set<string>();
  let hasDuplicates = false;
  for (const c of d.courses) {
    for (const k of [c.code, c.name].map((v) => (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean)) {
      if (seenKeys.has(k)) hasDuplicates = true;
      seenKeys.add(k);
    }
  }
  const openCount = new Map<string, number>();
  for (const a of d.all) openCount.set(a.course.id, (openCount.get(a.course.id) ?? 0) + 1);
  const first = d.all[0];
  const firstDue = first ? dueLabel(first.dueAt, first.dueAllDay, d.tz) : null;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : one.endsWith("s") ? "es" : "s"}`;

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

      {hasDuplicates && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="min-w-0 flex-1 text-[0.9375rem]">A class shows up twice. Merge them?</p>
          <ActionButton action={mergeDuplicateClassesAction} className="lf-sb lf-sb-sun lf-sb-sm">
            Merge duplicates
          </ActionButton>
        </Card>
      )}

      {d.courses.length === 0 ? (
        <Card className="mb-8">
          <EmptyState
            icon={<PixelIcon name="class" />}
            title="Add your first course"
            action={<CourseDialog action={createCourseAction} trigger="Add course" />}
          >
            Or tell <AssistantName />: “I&apos;m taking PSY 101, BIO 110 and MATH 152 this semester.”
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* the one next thing, in the real sky, with their skyling on a stack of books (asleep when nothing's due) */}
          <SkyWindow tz={d.tz} className="mb-5 rounded-[1.75rem]">
            <div className="relative min-h-[11rem] px-6 pt-5 pb-5">
              <p className="text-[0.75rem] font-semibold tracking-[0.14em] text-star-gold uppercase">Next up</p>
              {first && firstDue ? (
                <>
                  <Link
                    href={`/school/courses/${first.course.id}`}
                    className="-mt-0.5 -mb-2 line-clamp-2 block max-w-[68%] py-2 font-display text-[1.75rem] leading-[1.1] font-medium tracking-tight break-words"
                  >
                    {first.title}
                  </Link>
                  <p className="mt-1.5 max-w-[68%] text-sm text-white/80">
                    {first.course.code ?? first.course.name} · <span className={firstDue.overdue ? "font-semibold text-dawn-1" : ""}>{firstDue.text}</span>
                  </p>
                  <p className="lf-sw-glass mt-3 inline-flex rounded-full px-3 py-1 text-xs">
                    {plural(d.all.length, "thing")} open across {plural(d.courses.length, "class")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1.5 font-display text-[1.75rem] leading-[1.1] font-medium tracking-tight">Nothing due.</p>
                  <p className="mt-1.5 max-w-[60%] text-sm text-white/80">Enjoy the quiet.</p>
                </>
              )}
              <div className="absolute right-5 bottom-0 flex flex-col items-center">
                <MySkyling sleeping={!first} className="relative z-10 -mb-1 h-16 w-16 cursor-pointer" />
                <PixelArt art={BOOKS} className="w-14" />
              </div>
            </div>
          </SkyWindow>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.courses.map((c) => {
              const next = nextByCourse.get(c.id);
              const due = next ? dueLabel(next.dueAt, next.dueAllDay, d.tz) : null;
              return (
                <Link key={c.id} href={`/school/courses/${c.id}`} className="lf-hop group rounded-[1.5rem] bg-surface p-4 shadow-soft hover:shadow-lift">
                  <div className="flex items-start gap-3">
                    {/* the class as a little book, in its colour */}
                    <span
                      className="relative mt-0.5 h-11 w-8 shrink-0 rounded-[0.3rem] shadow-[inset_-4px_0_0_rgb(0_0_0/0.16)]"
                      style={{ background: c.color ?? "var(--accent)" }}
                      aria-hidden
                    >
                      <span className="absolute inset-x-1.5 top-2 h-1 bg-white/75" />
                      <span className="absolute inset-x-1.5 top-4 h-0.5 bg-white/50" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted">{c.code ?? "Course"}</p>
                      <p className="line-clamp-2 break-words font-medium">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[c.instructorName, c.meetingInfo && twelveHourRanges(c.meetingInfo)].filter(Boolean).join(" · ") || " "}
                      </p>
                    </div>
                    {openCount.get(c.id) ? (
                      <span className="lf-chip-night shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">{openCount.get(c.id)} open</span>
                    ) : null}
                  </div>
                  <div className="mt-3 border-t border-dashed border-border-strong/70 pt-3 text-xs">
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
          <section id="due" aria-label="Due" className="scroll-mt-24">
            <h2 className="mb-2 font-display text-[1.3125rem] leading-tight font-medium tracking-tight">Due</h2>
            <DueList view={view} list={d.due} tz={d.tz} hasCourses />
          </section>
        </>
      )}

      <AskJarvisButton
        prompt="Here's my syllabus. Add every due date and exam to the right class."
        className="lf-hop lf-night relative mb-4 flex w-full items-center gap-3 overflow-hidden rounded-[1.5rem] px-4 py-3.5 text-left text-[0.9375rem] leading-snug text-white shadow-lift"
      >
        <span className="lf-stars pointer-events-none absolute inset-0" aria-hidden />
        <MySkyling still className="relative h-12 w-12 shrink-0" />
        <span className="relative flex-1">
          Have a syllabus or a screenshot? Send it to <AssistantName /> and it&apos;ll add everything.
        </span>
        <span className="lf-send relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem]" aria-hidden>
          <PixelIcon name="send" className="h-[18px] w-[18px]" />
        </span>
      </AskJarvisButton>
      {!d.canvas && (
        <Link href="/settings/integrations" className="lf-hop mb-6 flex items-center gap-3 rounded-[1.5rem] bg-surface px-5 py-4 shadow-soft hover:shadow-lift">
          <span className="lf-chip-night h-10 w-10 shrink-0 rounded-[0.75rem]">
            <PixelIcon name="class" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold">Connect Canvas</span>
            <span className="block text-[0.8125rem] leading-snug text-text-2">Your classes and what is due.</span>
          </span>
        </Link>
      )}
    </>
  );
}
