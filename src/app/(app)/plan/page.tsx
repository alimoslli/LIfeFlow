import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { QuickAddButton } from "@/components/shell/quick-add";
import { CalendarViewToggle } from "../calendar/view-toggle";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { addDaysStr, daysBetween, formatDateStr, formatIn, isValidDateStr, localDateOf, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { findConflicts, getAgenda, type AgendaItem } from "@/server/services/calendar";
import { listEmployers } from "@/server/services/work";
import { listCourses } from "@/server/services/school";
import { listTasks } from "@/server/services/tasks";

export const metadata: Metadata = { title: "Plan" };

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "school", label: "School" },
  { key: "work", label: "Work" },
  { key: "personal", label: "Personal" },
] as const;

function matches(i: AgendaItem, f: string): boolean {
  if (f === "school") return i.origin === "assignment" || i.kind === "class" || i.kind === "exam" || i.kind === "study";
  if (f === "work") return i.origin === "shift" || i.kind === "work";
  if (f === "personal") return !matches(i, "school") && !matches(i, "work");
  return true;
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ f?: string; date?: string }> }) {
  const sp = await searchParams;
  const filter = FILTERS.find((x) => x.key === sp.f)?.key ?? "all";
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const from = sp.date && isValidDateStr(sp.date) && sp.date > today ? sp.date : today;
    const [items, courses, jobs, tasks] = await series(
      () => getAgenda(s, u.timezone, from, addDaysStr(from, 6)),
      () => listCourses(s),
      () => listEmployers(s),
      () => listTasks(s, { status: "open", topLevelOnly: true, limit: 200 }),
    );
    return { items, courses, jobs, openTasks: tasks.length, undated: tasks.filter((t) => !t.dueAt).slice(0, 5), today, from, tz: u.timezone };
  });
  const items = d.items.filter((i) => matches(i, filter));
  const conflictKeys = new Set(findConflicts(d.items).flatMap((c) => [c.a.key, c.b.key]));
  const days = Array.from({ length: 7 }, (_, n) => addDaysStr(d.from, n)).map((date) => ({
    date,
    items: items.filter((i) => localDateOf(i.startsAt, d.tz) === date),
  }));

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] leading-none font-medium tracking-tight">Calendar</h1>
          <div className="mt-3">
            <CalendarViewToggle active="week" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AskJarvisButton prompt="Add " className="tap flex items-center justify-center rounded-full bg-surface text-accent shadow-soft">
            <Sparkles className="h-4 w-4" aria-label="Add with Jarvis" />
          </AskJarvisButton>
          <QuickAddButton className="flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-text shadow-soft">
            <Plus className="h-4 w-4" /> Add
          </QuickAddButton>
        </div>
      </header>

      <nav
        className="lf-hscroll -mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label="Filter"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/plan" : `/plan?f=${f.key}`}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors",
              filter === f.key ? "bg-text text-bg" : "bg-surface text-text-2 shadow-soft hover:text-text",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-7">
        {days.map(({ date, items }) => {
          const diff = daysBetween(d.today, date);
          if (!items.length && diff > 1) return null;
          return (
            <section key={date} id={date} className="scroll-mt-6">
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className={cn("text-[15px] font-semibold", diff === 0 && "text-accent")}>
                  {diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : formatDateStr(date, "EEEE")}
                </span>
                <span className="text-sm text-muted">{formatDateStr(date, "MMM d")}</span>
              </h2>
              {items.length === 0 ? (
                <p className="py-2 text-[15px] text-muted">Nothing planned.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className="flex items-center gap-4 rounded-2xl bg-surface px-4 py-3 shadow-soft transition-shadow hover:shadow-lift">
                        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 break-words text-[15px]">
                            {i.origin === "assignment" && <span className="text-muted">Due · </span>}
                            {i.origin === "task" && <span className="text-muted">To do · </span>}
                            {i.title}
                          </p>
                          <p className="truncate text-sm text-muted">
                            {i.allDay
                              ? "Any time"
                              : i.endsAt
                                ? `${formatIn(i.startsAt, d.tz, "h:mm")}–${formatIn(i.endsAt, d.tz, "h:mm a")}`
                                : formatIn(i.startsAt, d.tz, "h:mm a")}
                            {i.subtitle ? ` · ${i.subtitle}` : ""}
                          </p>
                        </div>
                        {conflictKeys.has(i.key) && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">Overlaps</span>}
                        {i.kind === "exam" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Exam</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex justify-between text-sm">
        {d.from > d.today ? (
          <Link
            href={`/plan?${new URLSearchParams({ ...(filter !== "all" && { f: filter }), ...(addDaysStr(d.from, -7) > d.today && { date: addDaysStr(d.from, -7) }) })}`}
            className="flex min-h-11 items-center rounded-full bg-surface px-4 shadow-soft"
          >
            ← Earlier
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/plan?${new URLSearchParams({ ...(filter !== "all" && { f: filter }), date: addDaysStr(d.from, 7) })}`}
          className="flex min-h-11 items-center rounded-full bg-surface px-4 shadow-soft"
        >
          Next week →
        </Link>
      </div>

      {d.undated.length > 0 && filter !== "work" && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">Whenever you can</h2>
          <ul className="flex flex-col gap-1.5">
            {d.undated.map((t) => (
              <li key={t.id} className="rounded-2xl bg-surface px-4 py-3 text-[15px] shadow-soft">
                {t.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
