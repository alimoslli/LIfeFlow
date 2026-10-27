import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { TaskCheck } from "@/components/task-check";
import { formatIn, localDateOf } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withCurrentUser } from "@/server/auth/current-user";
import { getBriefing } from "@/server/briefing";
import type { AgendaItem } from "@/server/services/calendar";
import { listTasks } from "@/server/services/tasks";
import { toggleTaskAction } from "./tasks/actions";
import { AskBar, InsightList } from "./_today/insights";

const PR = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export default async function TodayPage() {
  const { briefing: b, snapshot: s, tasks, firstName } = await withCurrentUser(async (scope, user) => {
    const { briefing, snapshot } = await getBriefing(scope, user);
    const tasks = await listTasks(scope, { status: "open", topLevelOnly: true, limit: 50 });
    return { briefing, snapshot, tasks, firstName: user.name.split(" ")[0] };
  });
  const focus = [...tasks]
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || PR[a.priority] - PR[b.priority])
    .slice(0, 3);
  const minutesUntil = b.next ? Math.round((b.next.startsAt.getTime() - s.now.getTime()) / 60_000) : null;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-10">
      <header className="animate-rise">
        <p className="text-sm text-muted">{formatIn(s.now, s.tz, "EEEE, MMMM d")}</p>
        <h1 className="mt-2 font-display text-[40px] leading-[1.05] font-medium tracking-tight sm:text-[46px]">{b.headline}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-text-2">{b.summary}</p>
        <div className="mt-6">
          <AskBar name={firstName} />
        </div>
      </header>

      {b.next && (
        <section className="animate-rise" style={{ animationDelay: "60ms" }} aria-label="Up next">
          <div className="relative overflow-hidden rounded-3xl bg-accent p-5 text-accent-text shadow-lift sm:p-6">
            <p className="text-xs font-medium tracking-wide uppercase opacity-70">{minutesUntil! <= 0 ? "Happening now" : `Up next · in ${humanMinutes(minutesUntil!)}`}</p>
            <p className="mt-1.5 font-display text-[28px] leading-tight font-medium">{b.next.title}</p>
            <p className="mt-1 text-sm opacity-80">
              {formatIn(b.next.startsAt, s.tz, "h:mm")}–{formatIn(b.next.endsAt!, s.tz, "h:mm a")}
              {b.next.subtitle ? ` · ${b.next.subtitle}` : ""}
            </p>
          </div>
        </section>
      )}

      {b.insights.length > 0 && (
        <section aria-label="Jarvis noticed">
          <SectionTitle>Jarvis noticed</SectionTitle>
          <InsightList insights={b.insights} />
        </section>
      )}

      <section aria-label="Today" className="animate-rise" style={{ animationDelay: "200ms" }}>
        <SectionTitle href="/plan">Today</SectionTitle>
        {b.today.length === 0 ? <p className="text-[15px] text-muted">A clear day.</p> : <Timeline items={b.today} tz={s.tz} now={s.now} />}
      </section>

      {focus.length > 0 && (
        <section aria-label="On your list" className="animate-rise" style={{ animationDelay: "240ms" }}>
          <SectionTitle href="/tasks">On your list</SectionTitle>
          <ul className="flex flex-col">
            {focus.map((t) => (
              <li key={t.id} className="flex items-center gap-3.5 py-2.5">
                <TaskCheck done={false} action={toggleTaskAction.bind(null, t.id)} label={`Complete ${t.title}`} />
                <span className="flex-1 text-[15px]">{t.title}</span>
                {t.dueAt && <span className={cn("text-sm", t.dueAt < s.now ? "text-danger" : "text-muted")}>{formatIn(t.dueAt, s.tz, localDateOf(t.dueAt, s.tz) === s.today ? "'today'" : "EEE")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.safeToSpend && (
        <section aria-label="Money" className="animate-rise" style={{ animationDelay: "280ms" }}>
          <SectionTitle href="/money">Money</SectionTitle>
          <Link href="/money" className="group block rounded-3xl bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift sm:p-6">
            <p className="text-sm text-muted">{b.safeToSpend.amountCents >= 0 ? "Free to spend this month" : "Short this month by"}</p>
            <p className={cn("mt-1 font-display text-[40px] leading-none font-medium tracking-tight", b.safeToSpend.amountCents < 0 && "text-danger")}>
              {formatCents(Math.abs(b.safeToSpend.amountCents)).replace(/\.\d\d$/, "")}
            </p>
            {b.safeToSpend.amountCents >= 0 && <p className="mt-2 text-sm text-text-2">about {formatCents(b.safeToSpend.perDayCents).replace(/\.\d\d$/, "")} a day after bills</p>}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
              <Info className="mt-0.5 h-3 w-3 shrink-0" /> {b.safeToSpend.explanation}
            </p>
          </Link>
        </section>
      )}

      <section aria-label="This week" className="animate-rise" style={{ animationDelay: "320ms" }}>
        <SectionTitle href="/plan">This week</SectionTitle>
        <WeekStrip days={b.week} />
      </section>
    </div>
  );
}

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold text-text">{children}</h2>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-sm text-muted hover:text-text">
          See all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function Timeline({ items, tz, now }: { items: AgendaItem[]; tz: string; now: Date }) {
  return (
    <ol className="relative flex flex-col">
      {items.map((i) => {
        const past = (i.endsAt ?? i.startsAt) < now;
        const deadline = !i.blocksTime;
        return (
          <li key={i.key} className={cn("flex gap-4 py-2.5", past && "opacity-45")}>
            <span className="tabular w-16 shrink-0 pt-0.5 text-right text-sm text-muted">{i.allDay ? "—" : formatIn(i.startsAt, tz, "h:mm a")}</span>
            <span className="relative flex w-3 shrink-0 justify-center pt-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", deadline && "border-2 bg-transparent")} style={deadline ? { borderColor: i.color ?? "var(--accent)" } : { background: i.color ?? "var(--accent)" }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug">
                {deadline && <span className="text-muted">{i.origin === "task" ? "To do · " : "Due · "}</span>}
                {i.title}
              </p>
              {(i.subtitle || i.endsAt) && (
                <p className="mt-0.5 truncate text-sm text-muted">
                  {i.endsAt && !i.allDay ? `until ${formatIn(i.endsAt, tz, "h:mm a")}` : ""}
                  {i.subtitle && i.endsAt ? " · " : ""}
                  {i.subtitle}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function WeekStrip({ days }: { days: { date: string; label: string; busyMinutes: number; deadlines: number; exam: boolean; isToday: boolean }[] }) {
  const max = Math.max(8 * 60, ...days.map((d) => d.busyMinutes));
  return (
    <div className="grid grid-cols-7 gap-1.5 rounded-3xl bg-surface p-3 shadow-soft sm:gap-2 sm:p-4">
      {days.map((d) => (
        <Link key={d.date} href={`/plan?date=${d.date}`} className={cn("flex flex-col items-center gap-2 rounded-2xl py-2 transition-colors hover:bg-surface-2", d.isToday && "bg-surface-2")}>
          <span className={cn("text-xs", d.isToday ? "font-semibold text-accent" : "text-muted")}>{d.label}</span>
          <span className="flex h-14 w-2 items-end overflow-hidden rounded-full bg-surface-3" title={`${Math.round(d.busyMinutes / 60)}h booked`}>
            <span className="w-full rounded-full bg-accent/70" style={{ height: `${Math.max(d.busyMinutes ? 8 : 0, (d.busyMinutes / max) * 100)}%` }} />
          </span>
          <span className="flex h-4 items-center gap-0.5">
            {d.exam ? (
              <span className="rounded bg-danger-soft px-1 text-[9px] font-semibold text-danger">EXAM</span>
            ) : (
              Array.from({ length: Math.min(3, d.deadlines) }, (_, k) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-warning" />)
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}

function humanMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
