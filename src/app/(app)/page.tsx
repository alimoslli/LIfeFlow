import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { assistantProfile } from "@/lib/assistant";
import { Pressable } from "@/components/motion/pressable";
import { formatIn } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { withUser } from "@/server/db/with-user";
import { runDueSlot, topMessage } from "@/server/services/proactive/engine";
import { toCard } from "@/server/services/proactive/present";
import { getBriefing } from "@/server/briefing";
import type { AgendaItem } from "@/server/services/calendar";
import { listTasks } from "@/server/services/tasks";
import { QuickChips, RefreshPlan } from "./_today/day-plan";

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
  } = await withCurrentUser(async (scope, user) => {
    const top = await topMessage(scope);
    const { briefing, snapshot } = await getBriefing(scope, user);
    const tasks = await listTasks(scope, { status: "open", topLevelOnly: true, limit: 50 });
    return {
      briefing,
      snapshot,
      tasks,
      assistantName: assistantProfile(user.preferences).name,
      jarvisCard: top && !(locked && top.topic === "money") ? toCard(top, user.timezone) : null,
    };
  });
  const focus = [...tasks].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || PR[a.priority] - PR[b.priority]).slice(0, 3);
  const insights = locked ? b.insights.filter((i) => i.icon !== "money" && i.icon !== "trend" && i.icon !== "goal") : b.insights;
  const minutesUntil = b.next ? Math.round((b.next.startsAt.getTime() - s.now.getTime()) / 60_000) : null;

  const due = b.today.filter((i) => !((i.endsAt ?? i.startsAt) < s.now) || !i.blocksTime);
  const top = insights[0];
  const plan = {
    today: b.next
      ? `${minutesUntil! <= 0 ? "Now" : `In ${humanMinutes(minutesUntil!)}`}: ${b.next.title}. ${due.length} thing${due.length === 1 ? "" : "s"} on today's list.`
      : due.length
        ? `${due.length} thing${due.length === 1 ? "" : "s"} on today's list, nothing else scheduled.`
        : null,
    money: locked ? "Money is locked." : !b.money ? null : b.money.safeTodayCents != null ? "safe" : "cash",
  };

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-8">
      <header className="animate-rise" data-tour="today-page">
        <p className="text-sm text-muted">{formatIn(s.now, s.tz, "EEEE, MMMM d")}</p>
        <h1 className="mt-2 font-display text-[36px] leading-[1.05] font-medium tracking-tight sm:text-[44px]">{b.headline}</h1>
        <div className="mt-5">
          <QuickChips />
        </div>
      </header>

      <section aria-label={`${assistantName}'s plan for today`} className="animate-rise rounded-3xl bg-surface p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{assistantName}&apos;s plan for today</h2>
          <RefreshPlan />
        </div>
        <dl className="flex flex-col gap-3 text-[15px]">
          <PlanRow label="Today">
            {plan.today ?? (
              <>
                Nothing scheduled.{" "}
                <Link href="/plan" className="font-medium text-accent">
                  Add a class, shift or to-do
                </Link>
              </>
            )}
          </PlanRow>
          <PlanRow label="Money">
            {plan.money === null ? (
              <Link href="/finances/accounts" className="font-medium text-accent">
                Add an account to see what&apos;s safe to spend
              </Link>
            ) : locked ? (
              <Link href="/money" className="inline-flex items-center gap-1.5 font-medium text-accent">
                <Lock className="h-3.5 w-3.5" /> Unlock Money
              </Link>
            ) : plan.money === "safe" ? (
              <>
                <b className="tabular">{usd(b.money!.safeTodayCents!)}</b> safe to spend today.
              </>
            ) : (
              <>
                <b className="tabular">{usd(b.money!.liquidCents)}</b> in cash and checking.
              </>
            )}
          </PlanRow>
          <PlanRow label="Next step">
            {jarvisCard ? (
              <Link href="/jarvis/says" className="font-medium text-accent">
                {jarvisCard.title}
              </Link>
            ) : top?.action?.href ? (
              <Link href={top.action.href} className="font-medium text-accent">
                {top.text}
              </Link>
            ) : focus[0] ? (
              <Link href={`/tasks/${focus[0].id}`} className="font-medium text-accent">
                Start with {focus[0].title}
              </Link>
            ) : (
              <>You&apos;re clear. Tap Plan my day above for ideas.</>
            )}
          </PlanRow>
        </dl>
      </section>

      <section aria-label="Due today" className="animate-rise">
        <SectionTitle href="/plan">Due today</SectionTitle>
        {due.length === 0 ? <p className="text-[15px] text-muted">Nothing due today.</p> : <Timeline items={due} tz={s.tz} now={s.now} />}
      </section>

      {b.money && !locked && (
        <section aria-label="Money" className="animate-rise">
          <SectionTitle href="/money">Money</SectionTitle>
          <Pressable>
            <Link href="/money" className="grid grid-cols-3 gap-3 rounded-3xl bg-surface p-5 shadow-soft">
              <Stat label="Cash & checking" cents={b.money.liquidCents} />
              <Stat label={`Spent in ${formatIn(s.now, s.tz, "MMM")}`} cents={b.money.spentCents} />
              <Stat label="Came in" cents={b.money.incomeCents} tone="text-success" />
            </Link>
          </Pressable>
        </section>
      )}
    </div>
  );
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function PlanRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 leading-snug">{children}</dd>
    </div>
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

function humanMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
