import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui/surface";
import { addDaysStr, formatDateStr, formatIn, isValidDateStr, localDateOf, todayIn, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { findConflicts, getAgenda, type AgendaItem } from "@/server/services/calendar";
import { listCourses } from "@/server/services/school";
import { series } from "@/server/db/series";
import { createEventAction, deleteEventAction } from "./actions";
import { EventDialog } from "./event-dialog";

export const metadata: Metadata = { title: "Calendar" };

const HOUR_PX = 44;

/** Assigns side-by-side lanes within each cluster of mutually overlapping timed items. */
function layout(items: AgendaItem[]) {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const out: { item: AgendaItem; lane: number; lanes: number }[] = [];
  let cluster: { item: AgendaItem; lane: number }[] = [];
  let lanes: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    for (const c of cluster) out.push({ ...c, lanes: Math.max(1, lanes.length) });
    cluster = [];
    lanes = [];
  };
  for (const i of sorted) {
    if (cluster.length && i.startsAt.getTime() >= clusterEnd) flush();
    let lane = lanes.findIndex((end) => end <= i.startsAt.getTime());
    if (lane < 0) lane = lanes.length;
    lanes[lane] = i.endsAt!.getTime();
    clusterEnd = Math.max(cluster.length ? clusterEnd : 0, i.endsAt!.getTime());
    cluster.push({ item: i, lane });
  }
  flush();
  return out;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const today = todayIn(u.timezone);
    const anchor = sp.date && isValidDateStr(sp.date) ? sp.date : today;
    const from = weekStart(anchor);
    const to = addDaysStr(from, 6);
    const [items, courses] = await series(() => getAgenda(s, u.timezone, from, to), () => listCourses(s));
    return { items, courses, from, to, today, anchor, tz: u.timezone };
  });
  const { tz } = d;
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(d.from, i));
  const conflicts = findConflicts(d.items);
  const timed = d.items.filter((i) => i.blocksTime && i.endsAt && !i.allDay);
  const minutesOf = (x: Date) => {
    const [h, m] = formatIn(x, tz, "H:m").split(":").map(Number);
    return h * 60 + m;
  };
  const startHour = Math.min(7, ...timed.map((i) => Math.floor(minutesOf(i.startsAt) / 60)));
  const endHour = Math.max(22, ...timed.map((i) => Math.ceil(minutesOf(i.endsAt!) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const byDay = (day: string, f: (i: AgendaItem) => boolean) => d.items.filter((i) => localDateOf(i.startsAt, tz) === day && f(i));

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Your week at a glance."
        actions={
          <>
            <div className="flex items-center rounded-full bg-surface shadow-soft">
              <Link href={`/calendar?date=${addDaysStr(d.from, -7)}`} className="p-2 text-muted hover:text-text" aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <Link href="/calendar" className="px-3 py-2 text-sm">
                Today
              </Link>
              <Link href={`/calendar?date=${addDaysStr(d.from, 7)}`} className="p-2 text-muted hover:text-text" aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <EventDialog action={createEventAction} defaultDate={d.anchor} courses={d.courses} />
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm font-medium text-text-2">
        {formatDateStr(d.from, "MMM d")} – {formatDateStr(d.to, d.from.slice(5, 7) === d.to.slice(5, 7) ? "d, yyyy" : "MMM d, yyyy")}
      </p>

      {conflicts.length > 0 && (
        <div className="mb-5 flex flex-col gap-1.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {conflicts.slice(0, 4).map((c) => (
            <p key={c.a.key + c.b.key} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-medium">{c.a.title}</strong> overlaps <strong className="font-medium">{c.b.title}</strong> on {formatIn(c.b.startsAt, tz, "EEEE 'at' h:mm a")}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Week grid (desktop) */}
      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((day) => (
            <div key={day} className={cn("border-l border-border px-2 py-2 text-center", day === d.today && "bg-accent-soft/60")}>
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{formatDateStr(day, "EEE")}</p>
              <p className={cn("text-lg leading-tight font-medium", day === d.today && "text-accent")}>{formatDateStr(day, "d")}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border">
          <div className="py-1.5 pr-1.5 text-right text-[10px] text-muted">all-day</div>
          {days.map((day) => (
            <div key={day} className="flex min-h-8 flex-col gap-0.5 border-l border-border p-1">
              {byDay(day, (i) => i.allDay || !i.blocksTime).map((i) => (
                <Link key={i.key} href={i.href} className="truncate rounded px-1.5 py-0.5 text-[11px] leading-4" style={{ background: `color-mix(in srgb, ${i.color ?? "var(--accent)"} 14%, transparent)`, color: i.color ?? "var(--accent)" }} title={i.title}>
                  {!i.allDay && <span className="tabular mr-1 opacity-70">{formatIn(i.startsAt, tz, "h:mma").toLowerCase()}</span>}
                  {i.origin === "assignment" ? "Due: " : i.origin === "task" ? "☐ " : ""}
                  {i.title}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="relative grid max-h-[620px] grid-cols-[52px_repeat(7,1fr)] overflow-y-auto">
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="pr-1.5 text-right text-[10px] text-muted">
                <span className="relative -top-1.5">{h === 0 ? "" : `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`}</span>
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className="relative border-l border-border" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => (
                <div key={h} className="border-t border-border/60" style={{ height: HOUR_PX }} />
              ))}
              {layout(byDay(day, (i) => i.blocksTime && !i.allDay && !!i.endsAt)).map(({ item: i, lane, lanes }) => {
                const top = ((minutesOf(i.startsAt) - startHour * 60) / 60) * HOUR_PX;
                const endMin = localDateOf(i.endsAt!, tz) === day ? minutesOf(i.endsAt!) : endHour * 60;
                const height = Math.max(18, ((endMin - minutesOf(i.startsAt)) / 60) * HOUR_PX - 2);
                const color = i.color ?? "var(--accent)";
                return (
                  <Link
                    key={i.key}
                    href={i.href}
                    className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-tight transition-[filter] hover:brightness-95"
                    style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, borderColor: color, background: `color-mix(in srgb, ${color} 13%, var(--surface))` }}
                    title={`${i.title} · ${formatIn(i.startsAt, tz, "h:mm a")}–${formatIn(i.endsAt!, tz, "h:mm a")}`}
                  >
                    <p className="truncate font-medium text-text">{i.title}</p>
                    <p className="truncate text-muted">{formatIn(i.startsAt, tz, "h:mm")}–{formatIn(i.endsAt!, tz, "h:mm a")}</p>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* Agenda (mobile, and the place to manage events) */}
      <div className="mt-6 flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium">This week</h2>
        {days.map((day) => {
          const items = byDay(day, () => true);
          return (
            <section key={day}>
              <h3 className={cn("mb-2 text-[15px] font-semibold", day === d.today ? "text-accent" : "text-text")}>
                {formatDateStr(day, "EEEE")} <span className="font-normal text-muted">{formatDateStr(day, "MMM d")}</span>
              </h3>
              {items.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                <Card as="div" className="divide-y divide-border">
                  {items.map((i) => (
                    <div key={i.key} className="group flex items-center gap-3 px-4 py-2.5">
                      <span className="tabular w-20 shrink-0 text-xs text-muted">{i.allDay ? "All day" : formatIn(i.startsAt, tz, "h:mm a")}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color ?? "var(--accent)" }} />
                      <Link href={i.href} className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {i.origin === "assignment" ? "Due: " : ""}
                          {i.title}
                        </p>
                        {i.subtitle && <p className="truncate text-xs text-muted">{i.subtitle}</p>}
                      </Link>
                      <span className="text-[11px] text-muted capitalize">{i.origin === "event" ? i.kind : i.origin}</span>
                      {i.origin === "event" && (
                        <ActionButton action={deleteEventAction.bind(null, i.id)} confirm={`Delete "${i.title}"${i.key.includes(":") ? " (all occurrences if it repeats)" : ""}?`} title="Delete event" className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </ActionButton>
                      )}
                    </div>
                  ))}
                </Card>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
