import { usd } from "@/lib/jarvis-voice";
import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import { addDaysStr, dayOfWeek, daysBetween, formatDateStr, localDateOf, monthStart, weekStart } from "@/lib/dates";
import { goalProjection } from "@/lib/goal-math";
import { assignments, jarvisRuns, memories, tasks } from "../../db/schema";
import { series } from "../../db/series";
import { subscriptionReport } from "../finance/coach";
import { goalsWithPlans } from "../finance/goals";
import { netWorthTrend } from "../finance/investing";
import { budgetStatus, spendingByCategory } from "../finance/planning";
import { listAccounts } from "../finance/accounts";
import { balancesOf } from "../finance/overview";
import { queryTransactions } from "../finance/transactions";
import { listHabits } from "../habits";
import { listAssignments } from "../school";
import { listShifts } from "../work";
import type { Candidate, DetectContext, Detector } from "./detectors";

type Section = { heading: string; lines: string[] };
const spendOf = (t: { amountCents: number }) => Math.max(0, -t.amountCents);

// ------------------------------------------------------------------ patterns

/** Spending per day on weekends vs. weekdays over the last 8 weeks. */
export async function weekendPattern({ scope, today }: DetectContext) {
  const from = addDaysStr(weekStart(today), -56);
  const txns = await queryTransactions(scope, { from, to: addDaysStr(weekStart(today), -1), kinds: ["expense"], limit: 10000 });
  let weekend = 0;
  let weekday = 0;
  for (const t of txns) {
    if (dayOfWeek(t.date) % 6 === 0) weekend += spendOf(t);
    else weekday += spendOf(t);
  }
  const perWeekend = Math.round(weekend / 16);
  const perWeekday = Math.round(weekday / 40);
  if (perWeekday <= 0 || perWeekend < perWeekday * 1.5 || perWeekend - perWeekday < 1000) return null;
  return {
    text: `You spend about ${usd(perWeekend)} a day on weekends vs. ${usd(perWeekday)} on weekdays.`,
    fix: `Try a ${usd(Math.round((perWeekend * 2 * 0.8) / 500) * 500)} weekend cap (20% less than usual).`,
  };
}

/** How often assignments get finished in their last 24 hours. */
export async function lastMinutePattern({ scope }: DetectContext) {
  const rows = await scope.tx
    .select({ dueAt: assignments.dueAt, completedAt: assignments.completedAt })
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), isNotNull(assignments.completedAt), isNotNull(assignments.dueAt)));
  const recent = rows.slice(-20);
  if (recent.length < 4) return null;
  const late = recent.filter((r) => r.dueAt!.getTime() - r.completedAt!.getTime() < 24 * 3600_000).length;
  if (late / recent.length < 0.6) return null;
  return {
    text: `You finished ${late} of your last ${recent.length} assignments in their final 24 hours.`,
    fix: "Start each one two days earlier: I can block an hour the day an assignment is added.",
  };
}

// ------------------------------------------------------------------ daily

/** Morning: what's due, money status, and the one most important thing. */
export const morningBrief: Detector = async (ctx) => {
  const { scope, tz, today, now } = ctx;
  const [dueTasks, dueSoon, shifts, money] = await series(
    () =>
      scope.tx
        .select({ title: tasks.title, priority: tasks.priority })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, scope.userId),
            ne(tasks.status, "done"),
            isNotNull(tasks.dueAt),
            lte(tasks.dueAt, new Date(`${addDaysStr(today, 1)}T12:00:00Z`)),
          ),
        ),
    () => listAssignments(scope, tz, { view: "upcoming", now, limit: 10 }),
    () => listShifts(scope, tz, today, today),
    () => listAccounts(scope),
  );
  const assignmentsSoon = dueSoon.filter((a) => a.dueAt && localDateOf(a.dueAt, tz) <= addDaysStr(today, 1));
  const due = [
    ...assignmentsSoon.map((a) => `${a.title} (${a.course.name}) due ${localDateOf(a.dueAt!, tz) === today ? "today" : "tomorrow"}`),
    ...dueTasks.slice(0, 4).map((t) => t.title),
    ...shifts.map((s) => `Shift at ${s.employer.name}`),
  ];
  const urgent = dueTasks.find((t) => t.priority === "urgent" || t.priority === "high");
  const oneThing = assignmentsSoon[0] ? `Finish ${assignmentsSoon[0].title}` : urgent ? urgent.title : (dueTasks[0]?.title ?? (due.length ? due[0] : null));
  const moneyLine = money.length ? `${usd(balancesOf(money).cashCents)} available now` : null;
  if (!due.length && !moneyLine) return [];
  return [
    {
      kind: "morning_brief",
      topic: "general",
      dedupeKey: `morning_brief:${today}`,
      facts: {
        count: due.length,
        money: moneyLine,
        oneThing,
        sections: [
          { heading: "Due", lines: due.length ? due.slice(0, 6) : ["Nothing due today."] },
          ...(moneyLine ? [{ heading: "Money", lines: [moneyLine] }] : []),
          ...(oneThing ? [{ heading: "The one thing", lines: [oneThing] }] : []),
        ],
      },
      action: { type: "open", label: "Plan my day", href: "/plan" },
      priority: 85,
    },
  ];
};

/** Evening: what got done and what moves to tomorrow. */
export const eveningWrap: Detector = async ({ scope, tz, today }) => {
  const [done, late] = await series(
    () =>
      scope.tx
        .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.userId, scope.userId), eq(tasks.status, "done"), gte(tasks.completedAt, new Date(Date.now() - 36 * 3600_000)))),
    () =>
      scope.tx
        .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
        .from(tasks)
        .where(and(eq(tasks.userId, scope.userId), ne(tasks.status, "done"), isNotNull(tasks.dueAt), lte(tasks.dueAt, new Date(Date.now() + 36 * 3600_000)))),
  );
  const doneToday = done.filter((t) => t.completedAt && localDateOf(t.completedAt, tz) === today);
  const left = late.filter((t) => localDateOf(t.dueAt!, tz) <= today);
  if (!doneToday.length && !left.length) return [];
  return [
    {
      kind: "evening_wrap",
      topic: "general",
      dedupeKey: `evening_wrap:${today}`,
      facts: {
        done: doneToday.length,
        left: left.length,
        sections: [
          { heading: "Done today", lines: doneToday.length ? doneToday.map((t) => t.title).slice(0, 8) : ["Nothing checked off yet."] },
          ...(left.length ? [{ heading: "Moves to tomorrow", lines: left.map((t) => t.title).slice(0, 8) }] : []),
        ],
      },
      action: left.length ? { type: "move_tasks", label: "Move to tomorrow", taskIds: left.map((t) => t.id), to: addDaysStr(today, 1) } : undefined,
      priority: 80,
    },
  ];
};

// ------------------------------------------------------------------ weekly / monthly

/** Sunday evening: wins, what slipped, spending vs. budget, goals and forecasts, one change for next week. */
export const weeklyReview: Detector = async (ctx) => {
  const { scope, tz, today } = ctx;
  if (dayOfWeek(today) !== 0) return [];
  const wk = weekStart(today);
  const [taskRows, spend, budgets, goals, habitsList] = await series(
    () =>
      scope.tx
        .select({ title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, completedAt: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.userId, scope.userId), gte(tasks.updatedAt, new Date(`${addDaysStr(wk, -1)}T00:00:00Z`)))),
    () => queryTransactions(scope, { from: wk, to: today, kinds: ["expense"], limit: 5000 }),
    () => budgetStatus(scope, today),
    () => goalsWithPlans(scope, today),
    () => listHabits(scope, today),
  );
  const done = taskRows.filter((t) => t.status === "done" && t.completedAt && localDateOf(t.completedAt, tz) >= wk);
  const slipped = taskRows.filter((t) => t.status !== "done" && t.dueAt && localDateOf(t.dueAt, tz) >= wk && localDateOf(t.dueAt, tz) <= today);
  const spent = spend.reduce((s, t) => s + spendOf(t), 0);
  const weeklyBudget = Math.round((budgets.reduce((s, b) => s + b.limitCents, 0) * 7) / 30.44);
  const patterns = [await weekendPattern(ctx), await lastMinutePattern(ctx)].filter((p): p is { text: string; fix: string } => !!p);
  const over = budgets.filter((b) => b.percent > 100).sort((a, b) => a.remainingCents - b.remainingCents)[0];
  const change =
    patterns[0]?.fix ??
    (over
      ? `Keep ${over.categoryName} under ${usd(Math.max(0, over.limitCents / 4.35))} next week.`
      : slipped.length
        ? `Plan time for "${slipped[0].title}" first thing Monday.`
        : null);
  const streaks = habitsList.filter((h) => h.current >= 2).map((h) => `${h.title}: ${h.current} in a row`);
  const goalLines = goals
    .filter((g) => g.status === "active")
    .slice(0, 3)
    .map((g) => `${g.name}: ${g.percent}%${g.projectedDate ? `, on pace for ${formatDateStr(g.projectedDate, "MMMM yyyy")}` : ", no pace yet"}`);
  const sections: Section[] = [
    { heading: "Wins", lines: [`${done.length} to-do${done.length === 1 ? "" : "s"} done`, ...streaks].filter(Boolean) },
    { heading: "What slipped", lines: slipped.length ? slipped.map((t) => t.title).slice(0, 5) : ["Nothing. Clean week."] },
    {
      heading: "Spending",
      lines: [weeklyBudget ? `${usd(spent)} spent of about ${usd(weeklyBudget)} budgeted for the week` : `${usd(spent)} spent this week`],
    },
    ...(goalLines.length ? [{ heading: "Goals", lines: goalLines }] : []),
    ...(patterns.length ? [{ heading: "Patterns", lines: patterns.map((p) => p.text) }] : []),
    ...(change ? [{ heading: "One change for next week", lines: [change] }] : []),
  ];
  return [
    {
      kind: "weekly_review",
      topic: "general",
      dedupeKey: `weekly_review:${wk}`,
      facts: { done: done.length, slipped: slipped.length, spentCents: spent, budgetCents: weeklyBudget, change, sections },
      action: { type: "open", label: "Plan next week", href: "/plan" },
      priority: 85,
    },
  ];
};

/** First days of the month: net worth trend, savings rate, top categories, subscriptions, dreams. */
export const monthlyReview: Detector = async ({ scope, today }) => {
  if (Number(today.slice(8, 10)) > 3) return [];
  const last = monthStart(addDaysStr(monthStart(today), -1));
  const end = addDaysStr(monthStart(today), -1);
  const [txns, cats, worth, subs, goals] = await series(
    () => queryTransactions(scope, { from: last, to: end, kinds: ["expense", "income"], limit: 10000 }),
    () => spendingByCategory(scope, last, end),
    () => netWorthTrend(scope, today, 70),
    () => subscriptionReport(scope, today),
    () => goalsWithPlans(scope, today),
  );
  const income = txns.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0);
  const spent = txns.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0);
  if (!income && !spent) return [];
  const rate = income > 0 ? Math.round(((income - spent) / income) * 100) : null;
  const first = worth.find((w) => w.day >= last);
  const lastWorth = worth.at(-1);
  const sections: Section[] = [
    ...(first && lastWorth && first !== lastWorth
      ? [
          {
            heading: "Net worth",
            lines: [
              `${usd(lastWorth.netWorthCents)} (${lastWorth.netWorthCents >= first.netWorthCents ? "up" : "down"} ${usd(lastWorth.netWorthCents - first.netWorthCents)})`,
            ],
          },
        ]
      : []),
    { heading: "Savings rate", lines: [rate === null ? `${usd(spent)} spent, no income recorded` : `${rate}% (${usd(income - spent)} of ${usd(income)} in)`] },
    { heading: "Top spending", lines: cats.slice(0, 3).map((c) => `${c.name}: ${usd(c.cents)}`) },
    ...(subs.subscriptionsYearlyCents
      ? [{ heading: "Subscriptions", lines: [`${usd(subs.subscriptionsYearlyCents / 12)} a month, ${usd(subs.subscriptionsYearlyCents)} a year`] }]
      : []),
    ...(goals.length
      ? [
          {
            heading: "Dreams",
            lines: goals
              .filter((g) => g.status === "active")
              .slice(0, 3)
              .map((g) => `${g.name}: ${g.percent}%`),
          },
        ]
      : []),
  ];
  return [
    {
      kind: "monthly_review",
      topic: "money",
      dedupeKey: `monthly_review:${last}`,
      facts: { month: formatDateStr(last, "MMMM"), rate, spentCents: spent, incomeCents: income, sections },
      action: { type: "open", label: "See the month", href: "/money" },
      priority: 85,
    },
  ];
};

// ------------------------------------------------------------------ coaching

/** Sundays: for the goal closest to its date, where this pace lands vs. a little more each week. */
export const goalForecast: Detector = async ({ scope, today }) => {
  if (dayOfWeek(today) !== 0) return [];
  const goal = (await goalsWithPlans(scope, today))
    .filter((g) => g.status === "active" && g.remainingCents > 0)
    .sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"))[0];
  if (!goal) return [];
  const extraWeekly = goal.remainingCents > 200_000 ? 5000 : 2500;
  const faster = goalProjection(goal, goal.monthlyPaceCents + Math.round(extraWeekly * 4.345), today);
  if (!faster.projectedDate) return [];
  const weeksToTarget = goal.targetDate ? Math.max(1, daysBetween(today, goal.targetDate) / 7) : null;
  return [
    {
      kind: "goal_forecast",
      topic: "money",
      dedupeKey: `goal_forecast:${goal.id}:${weekStart(today)}`,
      facts: {
        goal: goal.name,
        paceDate: goal.projectedDate ? formatDateStr(goal.projectedDate, "MMMM yyyy") : null,
        fasterDate: formatDateStr(faster.projectedDate, "MMMM yyyy"),
        extraCents: extraWeekly,
        weeklyStepCents: weeksToTarget ? Math.ceil(goal.remainingCents / weeksToTarget / 100) * 100 : null,
      },
      action: { type: "contribute_goal", label: `Add ${usd(extraWeekly)} now`, goalId: goal.id, cents: extraWeekly },
      priority: 55,
    },
  ];
};

/** Habits: celebrate streaks of 3, 7, 14 and 30; when one keeps slipping, suggest a smaller step. */
export const habitCoach: Detector = async ({ scope, today }) => {
  const out: Candidate[] = [];
  for (const h of await listHabits(scope, today)) {
    if (!h.active) continue;
    if ([3, 7, 14, 30].includes(h.current) && h.doneThisPeriod)
      out.push({
        kind: "habit_streak",
        topic: "habits",
        dedupeKey: `habit_streak:${h.id}:${h.current}`,
        facts: { habit: h.title, days: h.current, best: h.current >= h.best },
        priority: 50,
      });
    const missed = h.recent.slice(1, 6).filter((d) => !d).length;
    const age = daysBetween(h.createdAt.toISOString().slice(0, 10), today);
    if (missed >= 3 && age >= (h.cadence === "daily" ? 5 : 28)) {
      const smaller = h.target ? Math.max(1, Math.round(h.target / 2)) : null;
      out.push({
        kind: "habit_struggle",
        topic: "habits",
        dedupeKey: `habit_struggle:${h.id}:${weekStart(today)}`,
        facts: { habit: h.title, missed, smaller: smaller && h.kind === "save" ? usd(smaller) : smaller && h.kind === "study" ? `${smaller} minutes` : null },
        action: { type: "open", label: "Adjust it", href: "/habits" },
        priority: 45,
      });
    }
  }
  return out;
};

/** Sunday evening: what Jarvis learned this week (new memories, how answers were rated), with a link to review it. */
export const weeklyLearned: Detector = async ({ scope, today, now }) => {
  if (dayOfWeek(today) !== 0) return [];
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [mems, runs] = await series(
    () =>
      scope.tx
        .select({ content: memories.content })
        .from(memories)
        .where(and(eq(memories.userId, scope.userId), eq(memories.status, "active"), gte(memories.createdAt, since))),
    () =>
      scope.tx
        .select({ rating: jarvisRuns.rating })
        .from(jarvisRuns)
        .where(and(eq(jarvisRuns.userId, scope.userId), gte(jarvisRuns.createdAt, since), isNotNull(jarvisRuns.rating))),
  );
  if (!mems.length && !runs.length) return [];
  const up = runs.filter((r) => r.rating === 1).length;
  const down = runs.length - up;
  return [
    {
      kind: "weekly_learned",
      topic: "general",
      dedupeKey: `weekly_learned:${today}`,
      facts: {
        count: mems.length,
        up,
        down,
        sections: [
          ...(mems.length ? [{ heading: "New things I know about you", lines: mems.slice(0, 5).map((m) => m.content) }] : []),
          ...(runs.length ? [{ heading: "Your ratings", lines: [`${up} helpful, ${down} not helpful`] }] : []),
        ],
      },
      action: { type: "open", label: "Review what I know", href: "/jarvis/memory" },
      priority: 45,
    },
  ];
};
