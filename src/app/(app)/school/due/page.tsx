import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui/surface";
import { todayIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { listAssignments, listCourses, type AssignmentView } from "@/server/services/school";
import { createAssignmentAction } from "../actions";
import { AssignmentList } from "../assignment-list";
import { AssignmentDialog } from "../forms";

export const metadata: Metadata = { title: "Due" };

const VIEWS: { key: AssignmentView; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export default async function DuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? "upcoming") as AssignmentView;
  const d = await withCurrentUser(async (s, u) => {
    const [courses, list] = await series(
      () => listCourses(s),
      () => listAssignments(s, u.timezone, { view }),
    );
    return { courses, list, tz: u.timezone };
  });
  return (
    <>
      <PageHeader
        title="Due"
        description="Every assignment and exam, soonest first."
        actions={d.courses.length > 0 && <AssignmentDialog action={createAssignmentAction} courses={d.courses} />}
      />
      <Tabs current={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: `/school/due?view=${v.key}` }))} />
      <Card className="mb-10">
        {d.list.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={view === "overdue" ? "Nothing overdue. Nice." : "Nothing here"}>
            {view === "completed"
              ? "Completed assignments will collect here."
              : d.courses.length
                ? "Send Jarvis your syllabus and every due date lands here."
                : "Add a class first, then send Jarvis its syllabus."}
          </EmptyState>
        ) : (
          <AssignmentList items={d.list} tz={d.tz} today={todayIn(d.tz)} />
        )}
      </Card>
    </>
  );
}
