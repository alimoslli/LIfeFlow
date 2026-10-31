import Link from "next/link";
import { ArrowRight, Link2, Lock, MapPin } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { assistantProfile } from "@/lib/assistant";
import { Pressable } from "@/components/motion/pressable";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { withUser } from "@/server/db/with-user";
import { runDueSlot, topMessage, unreadCount } from "@/server/services/proactive/engine";
import { listProposedMemories } from "@/server/services/memory";
import { runCount } from "@/server/jarvis/metrics";
import { tryThisIdea } from "@/lib/life";
import { daysBetween } from "@/lib/dates";
import type { DayGlance } from "@/server/briefing/types";
import { toCard } from "@/server/services/proactive/present";
import { getBriefing } from "@/server/briefing";
import { series } from "@/server/db/series";
import { googleConfig } from "@/server/integrations/google";
import { listPlaidConnections, plaidConfig } from "@/server/integrations/plaid";
import { integrationStatus } from "@/server/services/integrations";
import type { AgendaItem } from "@/server/services/calendar";
import { listTasks } from "@/server/services/tasks";
import { listHabits } from "@/server/services/habits";
import { ActionButton } from "@/components/action-form";
import { checkHabitAction } from "./habits/actions";
import { AskBar, TryThis } from "./_today/day-plan";
import { DayPlanCard } from "./_today/day-plan-card";
import { buildDayPlan } from "@/server/briefing/day-plan";

const PR = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export default async function TodayPage() {
  // With the Face ID lock on, money figures stay hidden here too until Money is unlocked.
  const me = await requireUser();
  const locked = await moneyLocked(me);
  // Jarvis takes his scheduled look (morning, midday, evening) the first time Today opens in each. Its own transaction, so a failure can't break Today.
  if (me.accountKind !== "demo")
    await withUser(me.id, (scope) => runDueSlot(scope, me.timezone, me.preferences)).catch((e) =>
      console.error("proactive slot failed", e instanceof Error ? e.name : e),
    );
  const {
    briefing: b,
    snapshot: s,
    tasks,
    assistantName,
    jarvisCard,
    setup,
    status,
    tip,
    habits,
  } = await withCurrentUser(async (scope, user) => {
    const top = await topMessage(scope);
    const { briefing, snapshot } = await getBriefing(scope, user);
    const [integrationList, banks, unread, proposed, runs, habits] = await series(
      () => integrationStatus(scope),
      () => listPlaidConnections(scope),
      () => unreadCount(scope),
      () => listProposedMemories(scope),
      () => runCount(scope),
      () => listHabits(scope, snapshot.today),
    );
    const setup = [
      googleConfig() && !integrationList.find((i) => i.provider === "google")?.connections.length ? "Google Calendar & Gmail" : null,
      plaidConfig() && !banks.length ? "your bank" : null,
    ].filter((x): x is string => !!x);
    const tasks = await listTasks(scope, { status: "open", topLevelOnly: true, limit: 50 });
    return {
      briefing,
      snapshot,
      tasks,
      assistantName: assistantProfile(user.preferences).name,
      setup,
      habits: habits.filter((h) => h.active && h.checkable && !h.doneThisPeriod).slice(0, 4),
      status: proposed.length
        ? { text: `${proposed.length} memor${proposed.length === 1 ? "y needs" : "ies need"} your OK`, href: "/jarvis/memory" }
        : unread
          ? { text: `${unread} new update${unread === 1 ? "" : "s"}`, href: "/jarvis/says" }
          : { text: "All caught up", href: "/jarvis/profile" },
      // A daily idea until the user has asked Jarvis 15 things.
      tip: runs < 15 ? tryThisIdea(user.preferences?.lifeStage, daysBetween("2026-01-01", snapshot.today)) : null,
      // Questions to the user (consent, get-to-know) live in Jarvis → Updates; the plan's next step is something to do.
      jarvisCard: top && top.kind !== "consent" && top.kind !== "question" && !(locked && top.topic === "money") ? toCard(top, user.timezone) : null,
    };
  });
  const focus = [...tasks].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || PR[a.priority] - PR[b.priority]).slice(0, 8);
  const insights = locked ? b.insights.filter((i) => i.icon !== "money" && i.icon !== "trend" && i.icon !== "goal") : b.insights;

  const schedule = b.today.filter((i) => i.blocksTime && (i.endsAt ?? i.startsAt) >= s.now);
  const plan = buildDayPlan(s, { ...b, insights }, { moneyHidden: locked, jarvisNext: jarvisCard, open: focus });
  const next = b.next && (b.next.endsAt ?? b.next.startsAt) > s.now ? b.next : null;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-7">
      <header className="animate-rise" data-tour="today-page">
        <p className="text-sm text-muted">{formatIn(s.now, s.tz, "EEEE, MMMM d")}</p>
        <h1 className="mt-2 font-display text-[36px] leading-[1.05] font-medium tracking-tight sm:text-[44px]">{b.headline}</h1>
        <Link href={status.href} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-text-2">
          <span className={cn("h-2 w-2 rounded-full", status.text === "All caught up" ? "bg-success" : "bg-accent")} />
          {assistantName} · {status.text}
        </Link>
      </header>

      <AskBar name={assistantName} />

      {b.money && locked && (
        <Link href="/money" className="flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-5 shadow-soft">
          <Lock className="h-5 w-5 text-accent" />
          <span className="flex-1 text-[15px]">Money is locked. Tap to unlock.</span>
          <ArrowRight className="h-4 w-4 text-muted" />
        </Link>
      )}
      {b.money && !locked && (
        <section aria-label="Money" className="animate-rise">
          <Pressable>
            <Link href="/money" className="grid grid-cols-3 gap-3 rounded-3xl bg-surface p-5 shadow-soft">
              <Stat label="Available now" cents={b.money.liquidCents} />
              <Stat label={`Spent in ${formatIn(s.now, s.tz, "MMM")}`} cents={b.money.spentCents} />
              <Stat label="Came in" cents={b.money.incomeCents} tone="text-success" />
            </Link>
          </Pressable>
        </section>
      )}

      {next && <NowNext item={next} tz={s.tz} now={s.now} />}

      <DayPlanCard plan={plan} name={assistantName} date={formatIn(s.now, s.tz, "EEEE, MMMM d")} />

      {habits.length > 0 && (
        <section aria-label="Habits" className="animate-rise">
          <SectionTitle href="/habits">Habits</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {habits.map((h) => (
              <li key={h.id}>
                <ActionButton
                  action={checkHabitAction.bind(null, h.id, true)}
                  title={`Done: ${h.title}`}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium shadow-soft"
                >
                  <span className="h-4 w-4 rounded-full border-2 border-border-strong" /> {h.title}
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WeekStrip days={b.week} />

      {schedule.length > 0 && (
        <section aria-label="Schedule" className="animate-rise">
          <SectionTitle href="/plan">Schedule</SectionTitle>
          <Timeline items={schedule} tz={s.tz} now={s.now} />
        </section>
      )}

      {tip && <TryThis title={tip.title} prompt={tip.prompt} day={s.today} />}

      {setup.length > 0 && (
        <Link href="/settings/integrations" className="animate-rise flex min-h-16 items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-soft">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Link2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Finish setting up</span>
            <span className="block text-sm text-muted">
              Connect {setup.join(" and ")} so {assistantName} sees everything.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}
    </div>
  );
}

/** The class, shift or event happening now, or the next one today. */
function NowNext({ item, tz, now }: { item: AgendaItem; tz: string; now: Date }) {
  const live = item.startsAt <= now;
  const mins = Math.round((item.startsAt.getTime() - now.getTime()) / 60_000);
  const when = live
    ? `Now${item.endsAt && !item.allDay ? `, until ${formatIn(item.endsAt, tz, "h:mm a")}` : ""}`
    : mins < 60
      ? `In ${mins} min, ${formatIn(item.startsAt, tz, "h:mm a")}`
      : `Next at ${formatIn(item.startsAt, tz, "h:mm a")}`;
  return (
    <section aria-label={live ? "Now" : "Next"} className="animate-rise rounded-3xl bg-surface p-5 shadow-soft">
      <p className={cn("text-xs font-medium tracking-wide uppercase", live ? "text-accent" : "text-muted")}>{when}</p>
      <p className="mt-1 text-[17px] leading-snug font-medium">{item.title}</p>
      {item.subtitle && (
        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.subtitle}</span>
        </p>
      )}
    </section>
  );
}

/** The next 7 days at a glance: how busy, deadlines and exams. Tap a day to open it. */
function WeekStrip({ days }: { days: DayGlance[] }) {
  return (
    <section aria-label="This week" className="animate-rise">
      <SectionTitle href="/plan">This week</SectionTitle>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <li key={d.date}>
            <Link
              href={`/plan?date=${d.date}`}
              aria-label={`${d.label}: ${d.deadlines} deadline${d.deadlines === 1 ? "" : "s"}${d.exam ? ", exam" : ""}`}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl py-2 text-xs",
                d.isToday ? "bg-hero text-hero-text" : "bg-surface shadow-soft",
              )}
            >
              <span className="font-medium">{d.isToday ? "Today" : d.label}</span>
              <span className="flex h-2 items-center gap-0.5">
                {d.exam && <span className="h-2 w-2 rounded-full bg-danger" />}
                {Array.from({ length: Math.min(d.deadlines, 3) }, (_, i) => (
                  <span key={i} className={cn("h-1.5 w-1.5 rounded-full", d.isToday ? "bg-hero-text" : "bg-accent")} />
                ))}
                {!d.exam && !d.deadlines && d.busyMinutes > 0 && <span className="h-1 w-3 rounded-full bg-muted/40" />}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cn("tabular mt-1 truncate text-lg font-medium", tone)}>
        <CountUp cents={cents} />
      </p>
    </div>
  );
}

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold text-text">{children}</h2>
      {href && (
        <Link href={href} className="-my-3 flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">
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
            <span className="tabular w-16 shrink-0 pt-0.5 text-right text-sm text-muted">{i.allDay ? "All day" : formatIn(i.startsAt, tz, "h:mm a")}</span>
            <span className="relative flex w-3 shrink-0 justify-center pt-2">
              <span
                className={cn("h-2.5 w-2.5 rounded-full", deadline && "border-2 bg-transparent")}
                style={deadline ? { borderColor: i.color ?? "var(--accent)" } : { background: i.color ?? "var(--accent)" }}
              />
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
