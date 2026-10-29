import { daysBetween, formatIn, localDateOf } from "@/lib/dates";
import type { Briefing, Insight, LifeSnapshot } from "./types";

/**
 * Jarvis's day plan on Today: a short summary, the top 3 things to do, what to
 * watch out for, and one next step. Built only from the user's records (pure, so
 * it's testable and never contradicts the numbers on screen).
 */

export type PlanPriority = { title: string; context: string | null; tag: string; late: boolean; href: string };
export type PlanWatch = { text: string; tone: "attention" | "heads-up"; href?: string };
export type PlanNext = { text: string; href?: string; prompt?: string; label: string };
export type DayPlan = { summary: string[]; priorities: PlanPriority[]; moreDue: number; watch: PlanWatch[]; next: PlanNext };

const usd = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
/** A label worth showing: a class name, or a high/urgent priority (not "Task" or "medium priority"). */
const useful = (c: string | null | undefined) => (!c || /^task$/i.test(c) || /^(low|medium) priority$/i.test(c) ? null : c);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildDayPlan(
  s: LifeSnapshot,
  b: Pick<Briefing, "today" | "next" | "insights">,
  opts: {
    moneyHidden?: boolean;
    jarvisNext?: { title: string } | null;
    /** Open to-dos (any due date), used to fill the list when little is late or due today. */
    open?: { id: string; title: string; priority: string; dueAt: Date | null }[];
  } = {},
): DayPlan {
  const { tz, today, now } = s;
  // Late work first (oldest first), then what's due today.
  const late = [...s.overdue].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const lateIds = new Set(late.map((o) => o.id));
  const dueToday = b.today.filter((i) => !i.blocksTime && (i.origin === "assignment" || i.origin === "task") && !lateIds.has(i.id) && i.startsAt >= now);
  const all: PlanPriority[] = [
    ...late.map((o) => {
      const days = Math.max(1, daysBetween(localDateOf(o.dueAt, tz), today));
      return { title: o.title, context: useful(o.context), tag: days === 1 ? "1 day late" : `${days} days late`, late: true, href: o.href };
    }),
    ...dueToday.map((i) => ({
      title: i.title,
      context: useful(i.subtitle),
      tag: i.allDay ? "due today" : `due ${formatIn(i.startsAt, tz, "h:mm a")}`,
      late: false,
      href: i.href,
    })),
  ];
  const listed = new Set([...late.map((o) => o.href), ...dueToday.map((i) => i.href)]);
  for (const t of opts.open ?? []) {
    const href = `/tasks/${t.id}`;
    if (listed.has(href) || (t.dueAt && t.dueAt < now)) continue;
    all.push({
      title: t.title,
      context: t.priority === "high" || t.priority === "urgent" ? `${t.priority} priority` : null,
      tag: t.dueAt ? `due ${formatIn(t.dueAt, tz, "EEE")}` : "no due date",
      late: false,
      href,
    });
  }
  const priorities = all.slice(0, 3);

  // Summary: schedule, work, money. One sentence each, only what's true.
  const timed = b.today.filter((i) => i.blocksTime && (i.endsAt ?? i.startsAt) > now);
  const summary = [
    timed.length
      ? `${plural(timed.length, "thing")} on your calendar today${b.next ? `, next is ${b.next.title} at ${formatIn(b.next.startsAt, tz, "h:mm a")}` : ""}.`
      : "Your calendar is clear today.",
    late.length
      ? `${plural(late.length, "item")} ${late.length === 1 ? "is" : "are"} overdue${dueToday.length ? ` and ${dueToday.length} more ${dueToday.length === 1 ? "is" : "are"} due today` : ""}.`
      : dueToday.length
        ? `${plural(dueToday.length, "thing")} due today, nothing overdue.`
        : "Nothing is due today and nothing is overdue.",
  ];
  const m = s.money;
  if (m && !opts.moneyHidden) {
    const over = m.overBudget.reduce((n, o) => n + (o.spentCents - o.limitCents), 0);
    const safe = m.safeToSpend && !m.safeToSpend.short ? `${usd(m.safeToSpend.todayCents)} is safe to spend today` : null;
    summary.push(
      over > 0
        ? `You're ${usd(over)} over budget in ${m.overBudget.length === 1 ? m.overBudget[0].category : `${m.overBudget.length} categories`} this month${safe ? `; ${safe}` : ""}.`
        : safe
          ? `${safe[0].toUpperCase()}${safe.slice(1)}, and every budget is on track.`
          : `You've spent ${usd(m.spentThisMonthCents)} this month.`,
    );
  }

  // Watch out: urgent and heads-up insights, minus the overdue list (already in priorities) and money when hidden.
  const watch: PlanWatch[] = b.insights
    .filter((i: Insight) => i.tone !== "good" && i.id !== "overdue")
    .filter((i) => !(opts.moneyHidden && (i.icon === "money" || i.icon === "trend" || i.icon === "goal")))
    .slice(0, 3)
    .map((i) => ({ text: i.text, tone: i.tone === "attention" ? "attention" : "heads-up", href: i.action?.href }));

  const next: PlanNext = opts.jarvisNext
    ? { text: opts.jarvisNext.title, href: "/jarvis/says", label: "See what Jarvis noticed" }
    : priorities[0]
      ? { text: `Start with ${priorities[0].title}${priorities[0].late ? ", the oldest late item" : ""}.`, href: priorities[0].href, label: "Open it" }
      : {
          text: "You're all caught up. Want a plan for something you've been putting off?",
          prompt: "Help me plan something useful for today based on my goals.",
          label: "Plan with Jarvis",
        };

  return { summary, priorities, moreDue: Math.max(0, all.length - priorities.length), watch, next };
}
