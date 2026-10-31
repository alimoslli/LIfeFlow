import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { addDaysStr, daysBetween, formatDateStr, formatIn, isValidDateStr, localDateOf, monthEnd, monthStart, todayIn, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { findConflicts, getAgenda, type AgendaItem } from "@/server/services/calendar";
import { listCourses } from "@/server/services/school";
import { createEventAction, deleteEventAction, skipOccurrenceAction } from "./actions";
import { DragItem, DropDay } from "./drag";
import { CalendarViewToggle } from "./view-toggle";
import { EventDialog } from "./event-dialog";

export const metadata: Metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; date?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const month =
      sp.month && /^\d{4}-\d{2}$/.test(sp.month) && isValidDateStr(`${sp.month}-01`)
        ? `${sp.month}-01`
        : monthStart(sp.date && isValidDateStr(sp.date) ? sp.date : today);
    const selected = sp.date && isValidDateStr(sp.date) ? sp.date : month === monthStart(today) ? today : month;
    const gridStart = weekStart(month);
    const gridEnd = addDaysStr(weekStart(monthEnd(month)), 6);
    const [items, courses] = await series(
      () => getAgenda(s, u.timezone, gridStart, gridEnd),
      () => listCourses(s),
    );
    return { items, courses, today, month, selected, gridStart, gridEnd, tz: u.timezone };
  });
  const { tz } = d;
  const byDay = new Map<string, AgendaItem[]>();
  for (const i of d.items) {
    const day = localDateOf(i.startsAt, tz);
    byDay.set(day, [...(byDay.get(day) ?? []), i]);
  }
  const days = Array.from({ length: daysBetween(d.gridStart, d.gridEnd) + 1 }, (_, n) => addDaysStr(d.gridStart, n));
  const prev = monthStart(addDaysStr(d.month, -1)).slice(0, 7);
  const next = monthStart(addDaysStr(monthEnd(d.month), 1)).slice(0, 7);
  const href = (month: string, date?: string) => `/calendar?month=${month}${date ? `&date=${date}` : ""}`;
  const dayItems = byDay.get(d.selected) ?? [];
  const conflicts = findConflicts(dayItems);
  const conflictKeys = new Set(conflicts.flatMap((c) => [c.a.key, c.b.key]));

  return (
    <div className="flex flex-col gap-6">
      <CalendarViewToggle active="month" />
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-none font-medium tracking-tight sm:text-[40px]">
          {formatDateStr(d.month, "MMMM")} <span className="text-muted">{formatDateStr(d.month, "yyyy")}</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full bg-surface shadow-soft">
            <Link
              href={href(prev)}
              scroll={false}
              className="tap flex items-center justify-center rounded-full text-muted hover:text-text"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link href="/calendar" scroll={false} aria-label="Jump to today" className="flex min-h-11 items-center px-2 text-sm font-medium">
              Today
            </Link>
            <Link
              href={href(next)}
              scroll={false}
              className="tap flex items-center justify-center rounded-full text-muted hover:text-text"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Month */}
        <section aria-label="Month" className="rounded-3xl bg-surface p-2 shadow-soft sm:p-3">
          <div className="grid grid-cols-7 pb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-2 text-center text-xs font-medium text-muted">
                <span className="sm:hidden">{w[0]}</span>
                <span className="hidden sm:inline">{w}</span>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {days.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === d.month.slice(0, 7);
              const isToday = day === d.today;
              const isSelected = day === d.selected;
              return (
                <DropDay
                  key={day}
                  date={day}
                  href={href(d.month.slice(0, 7), day)}
                  aria-label={`${formatDateStr(day, "EEEE, MMMM d")}: ${items.length} item${items.length === 1 ? "" : "s"}`}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center gap-1 rounded-2xl py-1.5 transition-colors sm:min-h-24 sm:items-stretch sm:px-1.5",
                    isSelected ? "bg-surface-2" : "hover:bg-surface-2/60",
                    !inMonth && "opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm tabular sm:h-7 sm:w-7",
                      isSelected ? "bg-hero font-semibold text-hero-text" : isToday ? "font-semibold text-accent ring-2 ring-accent" : "text-text",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {/* Phones: colored dots */}
                  <span className="flex h-1.5 gap-0.5 sm:hidden">
                    {items.slice(0, 3).map((i) => (
                      <span key={i.key} className="h-1.5 w-1.5 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                    ))}
                  </span>
                  {/* Larger screens: the first few titles */}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {items.slice(0, 3).map((i) => (
                      <span
                        key={i.key}
                        className="flex items-center gap-1 truncate rounded-md px-1 text-[11px] leading-5"
                        style={{ background: `color-mix(in srgb, ${i.color ?? "var(--accent)"} 14%, transparent)` }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                        <span className="truncate text-text">{i.title}</span>
                      </span>
                    ))}
                    {items.length > 3 && <span className="px-1 text-[11px] text-muted">+{items.length - 3} more</span>}
                  </span>
                </DropDay>
              );
            })}
          </div>
        </section>

        {/* Selected day */}
        <section aria-label="Selected day" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{d.selected === d.today ? "Today" : formatDateStr(d.selected, "EEEE")}</p>
              <h2 className="font-display text-2xl font-medium">{formatDateStr(d.selected, "MMMM d")}</h2>
            </div>
            <EventDialog action={createEventAction} defaultDate={d.selected} courses={d.courses} />
          </div>

          {conflicts.length > 0 && (
            <p className="flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-medium">{conflicts[0].a.title}</strong> overlaps <strong className="font-medium">{conflicts[0].b.title}</strong>.
              </span>
            </p>
          )}

          {dayItems.length === 0 ? (
            <p className="rounded-3xl bg-surface px-5 py-8 text-center text-[15px] text-muted shadow-soft">Nothing planned.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {dayItems.map((i) => (
                <DragItem
                  key={i.key}
                  origin={i.origin}
                  id={i.id}
                  movable={i.origin !== "shift"}
                  className="group flex items-center gap-4 rounded-2xl bg-surface px-4 py-3 shadow-soft"
                >
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                  <Link href={i.href} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
                    <p className="line-clamp-2 text-[15px]">
                      {i.origin === "assignment" && <span className="text-muted">Due · </span>}
                      {i.origin === "task" && <span className="text-muted">To do · </span>}
                      {i.title}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {i.allDay
                        ? "All day"
                        : i.endsAt
                          ? `${formatIn(i.startsAt, tz, "h:mm")}–${formatIn(i.endsAt, tz, "h:mm a")}`
                          : formatIn(i.startsAt, tz, "h:mm a")}
                      {i.subtitle ? ` · ${i.subtitle}` : ""}
                    </p>
                  </Link>
                  {conflictKeys.has(i.key) && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">Overlaps</span>}
                  {i.origin === "event" && i.repeats && (
                    <ActionButton
                      action={skipOccurrenceAction.bind(null, i.id, localDateOf(i.startsAt, d.tz))}
                      title="Remove just this day"
                      className="tap flex items-center justify-center rounded-full px-2 text-xs text-muted hover:text-danger"
                    >
                      This day
                    </ActionButton>
                  )}
                  {i.origin === "event" && (
                    <ActionButton
                      action={deleteEventAction.bind(null, i.id)}
                      title="Delete event"
                      className="tap flex items-center justify-center rounded-full text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ActionButton>
                  )}
                </DragItem>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
