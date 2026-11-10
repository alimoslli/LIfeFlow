import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { QuickAddButton } from "@/components/shell/quick-add";
import { CalendarViewToggle } from "../calendar/view-toggle";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { addDaysStr, daysBetween, formatDateStr, formatIn, isValidDateStr, localDateOf, localTimeOf, todayIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { findConflicts, getAgenda, getEvent, type AgendaItem } from "@/server/services/calendar";
import { listEmployers, listShifts } from "@/server/services/work";
import { getAssignment, listCourses } from "@/server/services/school";
import { listTasks } from "@/server/services/tasks";
import { lifeLoad } from "@/server/services/life-load";
import { moneyLocked } from "@/server/auth/money-lock";
import { LifeLoad } from "./life-load";
import { EditableBlock, type Block } from "./block-editor";
import { SkylingIcon } from "@/components/skylings/sprite";

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
    const locked = await moneyLocked(u);
    const from = sp.date && isValidDateStr(sp.date) && sp.date > today ? sp.date : today;
    const [items, courses, jobs, tasks, week] = await series(
      () => getAgenda(s, u.timezone, from, addDaysStr(from, 6)),
      () => listCourses(s),
      () => listEmployers(s),
      () => listTasks(s, { status: "open", topLevelOnly: true, limit: 200 }),
      () => lifeLoad(s, u.timezone, today, { includeMoney: !locked }),
    );
    // What each block's editor needs (every block on the calendar can be edited in place).
    const tz = u.timezone;
    const shifts = new Map((await listShifts(s, tz, from, addDaysStr(from, 6))).map((x) => [x.id, x]));
    const blocks: Record<string, Block> = {};
    for (const i of items) {
      if (i.origin === "task") blocks[i.key] = { origin: "task", id: i.id };
      else if (i.origin === "event") {
        const e = await getEvent(s, i.id).catch(() => null);
        if (!e) continue;
        blocks[i.key] = {
          origin: "event",
          id: e.id,
          title: e.title,
          date: localDateOf(i.startsAt, tz),
          startTime: i.allDay ? null : localTimeOf(i.startsAt, tz),
          endTime: i.allDay || !i.endsAt ? null : localTimeOf(i.endsAt, tz),
          allDay: i.allDay,
          kind: e.kind,
          location: e.location,
          description: e.description,
          repeats: !!e.recurrence,
        };
      } else if (i.origin === "shift") {
        const sh = shifts.get(i.id);
        if (!sh) continue;
        blocks[i.key] = {
          origin: "shift",
          id: sh.id,
          employerId: sh.employerId,
          date: localDateOf(sh.startsAt, tz),
          startTime: localTimeOf(sh.startsAt, tz),
          endTime: localTimeOf(sh.endsAt, tz),
          breakMinutes: sh.breakMinutes,
          notes: sh.notes,
        };
      } else if (i.origin === "assignment") {
        const a = await getAssignment(s, i.id).catch(() => null);
        if (!a) continue;
        blocks[i.key] = {
          origin: "assignment",
          id: a.id,
          title: a.title,
          kind: a.kind,
          dueDate: a.dueAt ? localDateOf(a.dueAt, tz) : null,
          dueTime: a.dueAt && !a.dueAllDay ? localTimeOf(a.dueAt, tz) : null,
          description: a.description,
          done: a.status === "done",
        };
      }
    }
    return { week, items, blocks, courses, jobs, openTasks: tasks.length, undated: tasks.filter((t) => !t.dueAt).slice(0, 5), today, from, tz };
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
          <h1 className="font-display text-[2.5rem] leading-none font-medium tracking-tight">Calendar</h1>
          <div className="mt-3">
            <CalendarViewToggle active="week" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AskJarvisButton
            prompt="Add "
            label="Add to your calendar"
            className="tap flex items-center justify-center rounded-full bg-surface text-accent shadow-soft"
          >
            <SkylingIcon className="h-6 w-6" />
          </AskJarvisButton>
          <QuickAddButton className="lf-sb lf-sb-sun lf-sb-sm">
            <Plus className="h-4 w-4" /> Add
          </QuickAddButton>
        </div>
      </header>

      {d.from === d.today && <LifeLoad week={d.week} />}

      <nav
        className="lf-hscroll -mx-5 -my-1.5 flex gap-1.5 overflow-x-auto px-5 py-1.5 [scrollbar-width:none] sm:-mx-8 sm:px-8 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
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
                <span className={cn("text-[0.9375rem] font-semibold", diff === 0 && "text-accent")}>
                  {diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : formatDateStr(date, "EEEE")}
                </span>
                <span className="text-sm text-muted">{formatDateStr(date, "MMM d")}</span>
              </h2>
              {items.length === 0 ? (
                <p className="py-2 text-[0.9375rem] text-muted">Nothing planned.</p>
              ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-3xl bg-surface shadow-soft">
                  {items.map((i) => (
                    <li key={i.key}>
                      <EditableBlock
                        block={d.blocks[i.key] ?? null}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 active:bg-surface-2"
                      >
                        <span className="tabular w-[60px] shrink-0 text-[0.8125rem] leading-tight text-muted">
                          {i.allDay ? "Any time" : formatIn(i.startsAt, d.tz, "h:mm a")}
                        </span>
                        <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[0.9375rem] leading-snug break-words">
                            {i.origin === "assignment" && <span className="text-muted">Due · </span>}
                            {i.origin === "task" && <span className="text-muted">To do · </span>}
                            {i.title}
                          </p>
                          {(i.endsAt && !i.allDay) || i.subtitle ? (
                            <p className="truncate text-[0.8125rem] text-muted">
                              {[!i.allDay && i.endsAt ? `until ${formatIn(i.endsAt, d.tz, "h:mm a")}` : null, i.subtitle].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        {conflictKeys.has(i.key) && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">Overlaps</span>}
                        {i.kind === "exam" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Exam</span>}
                      </EditableBlock>
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
            className="lf-sb lf-sb-app lf-sb-sm"
          >
            ← Earlier
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/plan?${new URLSearchParams({ ...(filter !== "all" && { f: filter }), date: addDaysStr(d.from, 7) })}`}
          className="lf-sb lf-sb-app lf-sb-sm"
        >
          Next week →
        </Link>
      </div>

      {d.undated.length > 0 && filter !== "work" && (
        <section>
          <h2 className="mb-2 text-[0.9375rem] font-semibold">Whenever you can</h2>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-3xl bg-surface shadow-soft">
            {d.undated.map((t) => (
              <li key={t.id} className="px-4 py-3 text-[0.9375rem]">
                {t.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
