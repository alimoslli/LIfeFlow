import { AssistantName } from "@/components/assistant-name";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { Card, EmptyState, Tabs } from "@/components/ui/surface";
import { todayIn } from "@/lib/dates";
import type { AssignmentView, listAssignments } from "@/server/services/school";
import { AssignmentList } from "./assignment-list";

type Item = Awaited<ReturnType<typeof listAssignments>>[number];

export const DUE_VIEWS: { key: AssignmentView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Done" },
];

/** Groups assignments by class, in the order their first item comes up (so the soonest class is first). */
function byClass(items: Item[]) {
  const groups = new Map<string, { key: string; name: string; color: string; items: Item[] }>();
  for (const a of items) {
    const g = groups.get(a.course.id) ?? {
      key: a.course.id,
      name: a.course.code ? `${a.course.code} · ${a.course.name}` : a.course.name,
      color: a.course.color ?? "var(--accent)",
      items: [],
    };
    g.items.push(a);
    groups.set(a.course.id, g);
  }
  return [...groups.values()];
}

/** School's "Due" section (the old Due page, owner's page map 2026-11-10): every assignment and exam by class, soonest first. */
export function DueList({ view, list, tz, hasCourses }: { view: AssignmentView; list: Item[]; tz: string; hasCourses: boolean }) {
  return (
    <>
      <Tabs current={view} items={DUE_VIEWS.map((v) => ({ key: v.key, label: v.label, href: `/school?view=${v.key}#due` }))} />
      <Card className="mb-10">
        {list.length === 0 ? (
          <EmptyState icon={<PixelIcon name="books" />} title={view === "overdue" ? "Nothing overdue. Nice." : "Nothing here"}>
            {view === "completed" ? (
              "What you finish collects here."
            ) : hasCourses ? (
              <>
                Send <AssistantName /> your syllabus and every due date lands here.
              </>
            ) : (
              <>
                Add a class first, then send <AssistantName /> its syllabus.
              </>
            )}
          </EmptyState>
        ) : (
          <div className="flex flex-col">
            {byClass(list).map((g) => (
              <section key={g.key} aria-label={g.name}>
                <header className="flex items-center gap-2.5 px-4 pt-4 pb-1 sm:px-5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                  <h2 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{g.name}</h2>
                  <span className="text-xs text-muted">{g.items.length}</span>
                </header>
                <AssignmentList items={g.items} tz={tz} today={todayIn(tz)} showCourse={false} />
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
