import Link from "next/link";
import { AlertTriangle, ArrowRight, Link2, Lock, MapPin, Wallet } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { assistantProfile } from "@/lib/assistant";
import { Pressable } from "@/components/motion/pressable";
import { addDaysStr, formatDateStr, formatIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { withUser } from "@/server/db/with-user";
import { runDueSlot, unreadCount } from "@/server/services/proactive/engine";
import { listProposedMemories } from "@/server/services/memory";
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
import { toggleAssignmentAction } from "./school/actions";
import { toggleTaskAction } from "./tasks/actions";
import { AskBar } from "./_today/day-plan";
import { TaskCheck } from "@/components/task-check";
import { billsAndPace } from "@/server/services/finance/forecast";
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
    setup,
    status,
    habits,
    nextBill,
  } = await withCurrentUser(async (scope, user) => {
    const { briefing, snapshot } = await getBriefing(scope, user);
    const [integrationList, banks, unread, proposed, habits, upcoming] = await series(
      () => integrationStatus(scope),
      () => listPlaidConnections(scope),
      () => unreadCount(scope),
      () => listProposedMemories(scope),
      () => listHabits(scope, snapshot.today),
      // The next bill in a week, tracked or found in the bank feed (skipped while Money is locked).
      async () => (briefing.money && !locked ? (await billsAndPace(scope, snapshot.today, snapshot.today, addDaysStr(snapshot.today, 7))).bills : []),
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
      nextBill: upcoming[0] ?? null,
      status: proposed.length
        ? { text: `${proposed.length} memor${proposed.length === 1 ? "y needs" : "ies need"} your OK`, href: "/jarvis/memory" }
        : unread
          ? { text: `${unread} new update${unread === 1 ? "" : "s"}`, href: "/jarvis/says" }
          : { text: "All caught up", href: "/jarvis/profile" },
    };
  });
  const focus = [...tasks].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || PR[a.priority] - PR[b.priority]).slice(0, 8);
  const insights = locked ? b.insights.filter((i) => i.icon !== "money" && i.icon !== "trend" && i.icon !== "goal") : b.insights;

  const next = b.next && (b.next.endsAt ?? b.next.startsAt) > s.now ? b.next : null;
  // The rest of today, after the card at the top: classes, shifts, events and what's due.
  const later = b.today.filter((i) => i.key !== next?.key && (i.endsAt ?? i.startsAt) >= s.now);
  const plan = buildDayPlan(s, { ...b, insights }, { moneyHidden: locked, open: focus });
  const warning = plan.watch.find((w) => w.tone === "attention");
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header className="animate-rise" data-tour="today-page">
        <p className="text-sm text-muted">{formatIn(s.now, s.tz, "EEEE, MMMM d")}</p>
        <h1 className="mt-2 font-display text-[36px] leading-[1.05] font-medium tracking-tight sm:text-[44px]">{b.headline}</h1>
        <Link href={status.href} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-text-2">
          <span className={cn("h-2 w-2 rounded-full", status.text === "All caught up" ? "bg-success" : "bg-accent")} />
          {assistantName} · {status.text}
        </Link>
      </header>

      <AskBar name={assistantName} />

      <UpNext item={next} tz={s.tz} now={s.now} />

      {warning && (
        <section aria-label="Heads up" className="animate-rise">
          <Link href={warning.href ?? "/money"} className="flex min-h-14 items-start gap-3 rounded-3xl bg-danger-soft px-4 py-3.5 text-danger">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.9} />
            <span className="flex-1 text-[15px] leading-snug font-medium">{warning.text}</span>
          </Link>
        </section>
      )}

      <section aria-label="Do today" className="animate-rise">
        <SectionTitle href="/tasks">Do today</SectionTitle>
        {plan.priorities.length === 0 ? (
          <p className="rounded-3xl bg-surface px-5 py-4 text-[15px] text-text-2 shadow-soft">Nothing due. A good day to get ahead.</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-3xl bg-surface px-4 shadow-soft">
            {plan.priorities.map((p, i) => (
              <li key={p.href + i} className="flex items-center gap-3 py-2.5">
                {p.check && (
                  <TaskCheck
                    done={false}
                    action={p.check.kind === "task" ? toggleTaskAction.bind(null, p.check.id) : toggleAssignmentAction.bind(null, p.check.id)}
                    label={`Mark "${p.title}" done`}
                  />
                )}
                <Link href={p.href} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
                  <span className="truncate text-[15px] leading-snug">{p.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className={cn("font-medium", p.late ? "text-danger" : "text-text-2")}>{p.tag}</span>
                    {p.context && <span className="truncate text-muted">· {p.context}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {plan.moreDue > 0 && (
          <Link href="/tasks" className="mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-accent">
            {plan.moreDue} more <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </section>

      {later.length > 0 && (
        <section aria-label="Later today" className="animate-rise">
          <SectionTitle href="/plan">Later today</SectionTitle>
          <Timeline items={later} tz={s.tz} now={s.now} />
        </section>
      )}

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
            <Link href="/money" className="flex min-h-16 items-center gap-3 rounded-3xl bg-surface px-5 py-3.5 shadow-soft">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Wallet className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Available now</span>
                <span className="tabular block text-lg leading-tight font-medium">
                  <CountUp cents={b.money.liquidCents} />
                </span>
              </span>
              <span className="min-w-0 text-right text-[13px] leading-snug">
                {nextBill ? (
                  <>
                    <span className="block truncate text-text-2">{nextBill.name}</span>
                    <span className="tabular block font-medium">
                      {formatCents(-nextBill.amountCents).replace(/\.00$/, "")} {nextBill.date === s.today ? "due today" : formatDateStr(nextBill.date, "EEE")}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No bills this week</span>
                )}
              </span>
            </Link>
          </Pressable>
        </section>
      )}

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

/** "1:00 – 2:15 PM" (or "11:30 AM – 12:45 PM"); just the start when there's no end. */
function timeSpan(item: AgendaItem, tz: string): string {
  const start = formatIn(item.startsAt, tz, "h:mm a");
  if (!item.endsAt || item.allDay) return start;
  const end = formatIn(item.endsAt, tz, "h:mm a");
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)} – ${end}` : `${start} – ${end}`;
}

/** The big card: the class, shift or event happening now, or the next one today. */
function UpNext({ item, tz, now }: { item: AgendaItem | null; tz: string; now: Date }) {
  if (!item)
    return (
      <section aria-label="Up next" className="animate-rise rounded-[28px] bg-hero p-5 text-hero-text shadow-lift">
        <p className="text-xs font-medium tracking-wide uppercase opacity-75">Up next</p>
        <p className="mt-1 text-[19px] leading-snug font-medium">Nothing else on your schedule today.</p>
      </section>
    );
  const live = item.startsAt <= now;
  const mins = Math.round((item.startsAt.getTime() - now.getTime()) / 60_000);
  const span = timeSpan(item, tz);
  const when = live
    ? `Now${item.endsAt && !item.allDay ? `, until ${formatIn(item.endsAt, tz, "h:mm a")}` : ""}`
    : mins < 60
      ? `In ${mins} min · ${span}`
      : mins < 180
        ? `In ${Math.round(mins / 60)}h · ${span}`
        : `Next · ${span}`;
  return (
    <section
      aria-label={live ? "Now" : "Up next"}
      className="animate-rise relative overflow-hidden rounded-[28px] bg-hero p-5 text-hero-text shadow-lift lf-sheen"
    >
      <p className="text-xs font-medium tracking-wide uppercase opacity-75">{when}</p>
      <p className="mt-1 text-[22px] leading-snug font-medium">{item.title}</p>
      {item.subtitle && (
        <p className="mt-1 flex items-center gap-1 text-sm opacity-80">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.subtitle}</span>
        </p>
      )}
    </section>
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
