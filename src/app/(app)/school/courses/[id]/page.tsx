import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Link2, Mail, MapPin, Clock, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { SubmitButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, SourceBadge } from "@/components/ui/surface";
import { formatIn, todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { searchNotes } from "@/server/services/notes";
import { courseGradeReport, getCourse, listAssignments, listMaterials } from "@/server/services/school";
import { GradeCard } from "../../grade-card";
import { addMaterialAction, createAssignmentAction, deleteCourseAction, deleteMaterialAction, setGradeWeightsAction, updateCourseAction } from "../../actions";
import { AssignmentList } from "../../assignment-list";
import { AssignmentDialog, CourseDialog } from "../../forms";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await withCurrentUser(async (s, u) => {
    const course = await getCourse(s, id).catch(() => null);
    if (!course) return null;
    const report = await courseGradeReport(s, u.timezone, id);
    const [upcoming, overdue, done, materials, notes] = await series(
      () => listAssignments(s, u.timezone, { courseId: id, view: "upcoming" }),
      () => listAssignments(s, u.timezone, { courseId: id, view: "overdue" }),
      () => listAssignments(s, u.timezone, { courseId: id, view: "completed" }),
      () => listMaterials(s, id),
      () => searchNotes(s, { courseId: id, limit: 10 }),
    );
    const undated = (await listAssignments(s, u.timezone, { courseId: id, view: "all" })).filter((a) => !a.dueAt && a.status !== "done");
    return { course, grade: report.grade, upcoming: [...overdue, ...upcoming, ...undated], done, materials, notes, tz: u.timezone };
  });
  if (!d) notFound();
  const c = d.course;
  const label = c.code ? `${c.code} · ${c.name}` : c.name;

  return (
    <>
      <Link href="/school" className="mb-4 hidden items-center gap-1 text-sm text-muted hover:text-text md:inline-flex">
        <ArrowLeft className="h-3.5 w-3.5" /> School
      </Link>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <span className="mt-1.5 h-12 w-1.5 rounded-full" style={{ background: c.color ?? "var(--accent)" }} />
          <div>
            <p className="text-sm font-medium text-muted">{[c.code, c.term].filter(Boolean).join(" · ") || "Course"}</p>
            <h1 className="font-display text-[32px] leading-tight font-medium tracking-tight">{c.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-2">
              {c.instructorName && <span>{c.instructorName}</span>}
              {c.instructorEmail && (
                <a href={`mailto:${c.instructorEmail}`} className="flex items-center gap-1 hover:text-accent">
                  <Mail className="h-3.5 w-3.5" /> {c.instructorEmail}
                </a>
              )}
              {c.meetingInfo && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {c.meetingInfo}
                </span>
              )}
              {c.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {c.location}
                </span>
              )}
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Course site
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AskJarvisButton
            prompt={`Build a study plan for ${label} around my schedule.`}
            className="flex min-h-11 items-center rounded-full bg-surface px-4 text-[13px] font-medium shadow-soft"
          >
            Study plan with Jarvis
          </AskJarvisButton>
          <AskJarvisButton prompt={`About ${label}: `} className="flex min-h-11 items-center rounded-full bg-surface px-4 text-[13px] font-medium shadow-soft">
            Ask about this class
          </AskJarvisButton>
          <AssignmentDialog action={createAssignmentAction} courses={[c]} defaultCourseId={c.id} />
          <CourseDialog action={updateCourseAction.bind(null, c.id)} course={c} trigger="Edit" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Upcoming & open" subtitle={`${d.upcoming.length} item${d.upcoming.length === 1 ? "" : "s"}`} />
            {d.upcoming.length ? (
              <AssignmentList items={d.upcoming} tz={d.tz} today={todayIn(d.tz)} showCourse={false} />
            ) : (
              <EmptyState title="Nothing open for this course" />
            )}
          </Card>
          {d.done.length > 0 && (
            <Card>
              <CardHeader title="Completed" />
              <AssignmentList items={d.done} tz={d.tz} today={todayIn(d.tz)} showCourse={false} />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-5 max-lg:order-first">
          <GradeCard grade={d.grade} weights={c.gradeWeights ?? null} action={setGradeWeightsAction.bind(null, c.id)} />
          <Card>
            <CardHeader title="Materials & links" />
            <ul className="px-5">
              {d.materials.map((m) => (
                <li key={m.id} className="group flex items-center gap-2 py-1.5 text-sm">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 line-clamp-2 break-words hover:text-accent">
                      {m.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 line-clamp-2 break-words">{m.title}</span>
                  )}
                  {m.module && <span className="text-xs text-muted">{m.module}</span>}
                  <ActionButton action={deleteMaterialAction.bind(null, m.id)} title="Remove" className="hidden text-muted group-hover:block hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </ActionButton>
                </li>
              ))}
            </ul>
            <div className="px-5 pt-2 pb-4">
              <ActionForm action={addMaterialAction.bind(null, c.id)} className="gap-2">
                <Input name="title" placeholder="Title (e.g. Week 4 slides)" required className="h-8 text-[13px]" aria-label="Material title" />
                <div className="flex gap-2">
                  <Input name="url" type="url" placeholder="https://" className="h-8 text-[13px]" aria-label="Material link" />
                  <SubmitButton size="sm" variant="secondary">
                    Add
                  </SubmitButton>
                </div>
              </ActionForm>
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Notes"
              action={
                <Link href={`/notes?course=${c.id}`} className="text-xs font-medium text-accent hover:underline">
                  New note
                </Link>
              }
            />
            {d.notes.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted">No notes linked to this course.</p>
            ) : (
              <ul className="px-5 pb-3">
                {d.notes.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`} className="flex items-center gap-2 py-1.5 text-sm hover:text-accent">
                      <FileText className="h-3.5 w-3.5 text-muted" />
                      <span className="flex-1 line-clamp-2 break-words">{n.title}</span>
                      <span className="text-xs text-muted">{formatIn(n.updatedAt, d.tz, "MMM d")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <SourceBadge source={c.source} />
            <ActionButton action={deleteCourseAction.bind(null, c.id)} className="flex items-center gap-1 rounded px-2 py-1 text-danger hover:bg-danger-soft">
              <Trash2 className="h-3.5 w-3.5" /> Delete course
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}
