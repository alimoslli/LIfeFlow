import { addDaysStr, daysBetween, formatDateStr, formatIn, localDateOf } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { findConflicts, type AgendaItem } from "../services/calendar";
import type { Briefing, DayGlance, Insight, LifeSnapshot } from "./types";

/** Sentences read better with whole dollars: "$1,842", "$12.50" only under $100. */
const money = (c: number) => (Math.abs(c) >= 10_000 ? formatCents(Math.round(c / 100) * 100).replace(/\.00$/, "") : formatCents(c).replace(/\.00$/, ""));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function dayName(date: string, today: string) {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d < 0) return `${-d} days ago`;
  if (d < 7) return formatDateStr(date, "EEEE");
  return formatDateStr(date, "MMM d");
}

// ---------------------------------------------------------------- rules

type Rule = (s: LifeSnapshot) => Insight[];

const overdueRule: Rule = (s) => {
  if (!s.overdue.length) return [];
  const [first] = s.overdue;
  const others = s.overdue.length - 1;
  return [
    {
      id: "overdue",
      tone: "attention",
      icon: "clock",
      text: others
        ? `${first.title} and ${plural(others, "other item")} are past due.`
        : `${first.title} was due ${dayName(localDateOf(first.dueAt, s.tz), s.today)}.`,
      detail: first.kind === "assignment" && !others ? first.context : undefined,
      action: {
        label: "Make a catch-up plan",
        prompt: `I'm behind on ${s.overdue.map((o) => o.title).join(", ")}. Help me catch up this week without dropping anything else.`,
      },
      score: 100,
    },
  ];
};

const conflictRule: Rule = (s) =>
  findConflicts(s.week)
    .slice(0, 1)
    .map(({ a, b }) => ({
      id: `conflict-${a.key}-${b.key}`,
      tone: "attention" as const,
      icon: "conflict" as const,
      text: `${a.title} overlaps ${b.title} ${dayName(localDateOf(b.startsAt, s.tz), s.today)} at ${formatIn(b.startsAt, s.tz, "h:mm a")}.`,
      action: { label: "Help me sort it out", prompt: `${a.title} overlaps ${b.title} on ${formatIn(b.startsAt, s.tz, "EEEE")}. What are my options?` },
      score: 90,
    }));

const examRule: Rule = (s) => {
  const exam = s.exams.find((e) => e.kind === "exam") ?? s.exams[0];
  if (!exam) return [];
  const date = localDateOf(exam.dueAt, s.tz);
  const daysAway = daysBetween(s.today, date);
  const pref = s.studyTime ? ` in the ${s.studyTime}` : "";
  const morning = s.studyTime === "morning";
  const best = s.freeMinutesByDay
    .filter((d) => d.date < date && (morning ? d.morningMinutes >= 90 : d.longest >= 90))
    .sort((a, b) => (morning ? b.morningMinutes - a.morningMinutes : b.longest - a.longest))
    .slice(0, 2)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => formatDateStr(d.date, "EEEE"));
  const windows = best.length
    ? `${best.join(" and ")} ${morning ? (best.length > 1 ? "mornings are" : "morning is") : best.length > 1 ? "have" : "has"} ${morning ? "open" : "the most open time"} for studying.`
    : undefined;
  return [
    {
      id: `exam-${exam.id}`,
      tone: daysAway <= 3 ? "attention" : "heads-up",
      icon: "book",
      text: `${exam.course} ${exam.kind} ${daysAway === 0 ? "is today" : `is ${dayName(date, s.today)}`}${exam.kind === "exam" ? "" : `: ${exam.title}`}.`,
      detail: daysAway > 0 ? windows : undefined,
      action: {
        label: "Plan study time",
        prompt: `Plan study sessions${pref} for my ${exam.course} ${exam.kind} (${exam.title}) around my classes and shifts, and add them to my calendar.`,
      },
      score: 80 - daysAway * 3,
    },
  ];
};

const busyDayRule: Rule = (s) => {
  const tomorrow = addDaysStr(s.today, 1);
  const minutes = busyMinutes(s.week, tomorrow, s.tz);
  if (minutes < 7 * 60) return [];
  return [
    {
      id: "busy-tomorrow",
      tone: "heads-up",
      icon: "calendar",
      text: `Tomorrow is packed: ${Math.round(minutes / 60)} hours already booked.`,
      action: { label: "Prep tonight", prompt: "Tomorrow is busy. What should I get done tonight so it goes smoothly?" },
      score: 55,
    },
  ];
};

const overBudgetRule: Rule = (s) => {
  const o = s.money?.overBudget[0];
  if (!o) return [];
  const over = o.spentCents - o.limitCents;
  const why =
    o.topMerchant && o.topMerchantChangeCents && o.topMerchantChangeCents > 0
      ? `${o.topMerchant} is up ${money(o.topMerchantChangeCents)} from last month.`
      : undefined;
  return [
    {
      id: `budget-${o.category}`,
      tone: "attention",
      icon: "money",
      text: `${o.category} is ${money(over)} over budget this month.`,
      detail: why,
      action: {
        label: "Find easy savings",
        prompt: `My ${o.category} spending is over budget. Look at what's driving it and suggest a few changes that won't make my life harder.`,
      },
      score: 70,
    },
  ];
};

const headingOverRule: Rule = (s) => {
  const h = s.money?.headingOver?.[0];
  if (!h) return [];
  return [
    {
      id: `pace-${h.category}`,
      tone: "heads-up",
      icon: "money",
      text: `${h.category} is on pace for ${money(h.projectedCents)}, over its ${money(h.limitCents)} budget.`,
      detail: h.fix ?? undefined,
      action: { label: "See budgets", href: "/finances/budgets" },
      score: 65,
    },
  ];
};

const overdraftRule: Rule = (s) => {
  const o = s.money?.overdraft;
  if (!o) return [];
  return [
    {
      id: "overdraft",
      tone: "attention",
      icon: "money",
      text: o.evenWithPay
        ? `Checking could go below $0 around ${dayName(o.date, s.today)} at your usual pace.`
        : `Checking could go below $0 around ${dayName(o.date, s.today)} if your next paycheck is late.`,
      action: { label: "Plan around it", prompt: "My checking might go below zero soon. Show me the forecast and help me avoid an overdraft." },
      score: 80,
    },
  ];
};

const spendingPaceRule: Rule = (s) => {
  const m = s.money;
  if (!m || m.lastMonthSameSpanSpendCents < 5_000) return [];
  const diff = m.spentThisMonthCents - m.lastMonthSameSpanSpendCents;
  const pct = Math.round((diff / m.lastMonthSameSpanSpendCents) * 100);
  if (Math.abs(pct) < 15) return [];
  return [
    pct > 0
      ? {
          id: "pace-up",
          tone: "heads-up",
          icon: "trend",
          text: `You're spending ${pct}% more than this time last month.`,
          action: { label: "Why?", prompt: "Why am I spending more than usual this month?" },
          score: 60,
        }
      : { id: "pace-down", tone: "good", icon: "trend", text: `You've spent ${-pct}% less than this time last month. Nice.`, score: 30 },
  ];
};

const billsRule: Rule = (s) => {
  const soon = s.money?.billsNext30.filter((b) => daysBetween(s.today, b.date) <= 3) ?? [];
  if (!soon.length) return [];
  const total = soon.reduce((a, b) => a - b.amountCents, 0);
  return [
    {
      id: "bills-soon",
      tone: "heads-up",
      icon: "money",
      text:
        soon.length === 1
          ? `${soon[0].name} (${money(-soon[0].amountCents)}) is due ${dayName(soon[0].date, s.today)}.`
          : `${plural(soon.length, "bill")} totaling ${money(total)} are due in the next 3 days.`,
      score: 50,
    },
  ];
};

const goalRule: Rule = (s) => {
  const g = s.money?.goals.find((x) => x.percent < 100 && x.monthlyNeededCents);
  if (!g) return [];
  return [
    {
      id: `goal-${g.name}`,
      tone: "good",
      icon: "goal",
      text: `${g.name} is ${g.percent}% there.`,
      detail: g.monthlyNeededCents ? `About ${money(g.monthlyNeededCents)} a month keeps you on track.` : undefined,
      action: { label: "How do I get there faster?", prompt: `How can I reach my ${g.name} goal faster?` },
      score: 20,
    },
  ];
};

export const RULES: Rule[] = [
  overdueRule,
  conflictRule,
  examRule,
  overdraftRule,
  overBudgetRule,
  headingOverRule,
  spendingPaceRule,
  busyDayRule,
  billsRule,
  goalRule,
];

export function deriveInsights(s: LifeSnapshot, limit = 4): Insight[] {
  return RULES.flatMap((r) => r(s))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------- day summary

export function busyMinutes(items: AgendaItem[], date: string, tz: string) {
  return items
    .filter((i) => i.blocksTime && i.endsAt && localDateOf(i.startsAt, tz) === date)
    .reduce((sum, i) => sum + (i.endsAt!.getTime() - i.startsAt.getTime()) / 60_000, 0);
}

export function weekGlance(s: LifeSnapshot): DayGlance[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(s.today, i);
    const items = s.week.filter((x) => localDateOf(x.startsAt, s.tz) === date);
    return {
      date,
      label: i === 0 ? "Today" : formatDateStr(date, "EEE"),
      busyMinutes: busyMinutes(s.week, date, s.tz),
      deadlines: items.filter((x) => x.origin === "assignment").length,
      exam: items.some((x) => x.kind === "exam"),
      isToday: i === 0,
    };
  });
}

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** One or two human sentences describing the rest of today. */
export function summarizeDay(s: LifeSnapshot, todayItems: AgendaItem[]): string {
  const upcoming = todayItems.filter((i) => (i.endsAt ?? i.startsAt) > s.now);
  const timed = upcoming.filter((i) => i.blocksTime);
  const deadlines = upcoming.filter((i) => i.origin === "assignment");
  const parts: string[] = [];
  if (!timed.length && !deadlines.length) parts.push(todayItems.length ? "You're done with today's schedule." : "Nothing on your calendar today.");
  else {
    if (timed.length) {
      const last = timed[timed.length - 1];
      parts.push(`${plural(timed.length, "thing")} left on your calendar, free after ${formatIn(last.endsAt!, s.tz, "h:mm a").replace(":00", "")}.`);
    }
    if (deadlines.length) parts.push(`${deadlines.map((d) => d.title).join(" and ")} ${deadlines.length === 1 ? "is" : "are"} due tonight.`);
  }
  return parts.join(" ");
}

export function buildBriefing(s: LifeSnapshot): Briefing {
  const today = s.week.filter((i) => localDateOf(i.startsAt, s.tz) === s.today);
  const next = today.find((i) => i.blocksTime && i.endsAt && i.endsAt > s.now) ?? null;
  return {
    headline: `${greeting(Number(formatIn(s.now, s.tz, "H")))}, ${s.firstName}.`,
    summary: summarizeDay(s, today),
    next,
    today,
    insights: deriveInsights(s),
    money: s.money
      ? {
          liquidCents: s.money.liquidCents,
          spentCents: s.money.spentThisMonthCents,
          incomeCents: s.money.incomeThisMonthCents,
          periodLabel: s.money.periodLabel,
          asOf: s.money.asOf,
          safeTodayCents: s.money.safeToSpend?.todayCents ?? null,
        }
      : null,
    week: weekGlance(s),
  };
}
