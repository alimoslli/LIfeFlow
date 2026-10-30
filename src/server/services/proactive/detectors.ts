import { usd } from "@/lib/jarvis-voice";
import { and, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { addDaysStr, daysBetween, formatDateStr, localDateOf, localTimeOf, monthStart, relativeDayLabel, startOfLocalDay, weekStart } from "@/lib/dates";
import { gmailMessages, tasks, type JarvisTopic, type ProactiveAction } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { listAccounts } from "../finance/accounts";
import { balancesOf } from "../finance/overview";
import { cashForecast } from "../finance/forecast";
import { goalsWithPlans } from "../finance/goals";
import { budgetStatus, upcomingRecurring } from "../finance/planning";
import { planPaycheck } from "../finance/coach";
import { queryTransactions } from "../finance/transactions";
import { merchantKey } from "../finance/recurring-detect";
import { listAssignments } from "../school";
import { listShifts } from "../work";
import { getAgenda, freeSlots } from "../calendar";
import { subscriptionsOverview } from "../finance/subscriptions";
import { billsToReview, findSavings, listSavings } from "../finance/savings-finder";
import { webSearchClient } from "../../integrations/web-search";
import { eveningWrap, goalForecast, habitCoach, monthlyReview, morningBrief, weeklyLearned, weeklyReview } from "./reviews";

/** Something worth saying, with the facts behind it. Wording happens later (lib/jarvis-voice). */
export type Candidate = {
  kind: string;
  topic: JarvisTopic | "general";
  dedupeKey: string;
  facts: Record<string, unknown>;
  action?: ProactiveAction;
  priority: number;
  urgent?: boolean;
};

export type DetectContext = { scope: UserScope; tz: string; today: string; now: Date };
export type Detector = (c: DetectContext) => Promise<Candidate[]>;

const spendOf = (t: { amountCents: number }) => Math.max(0, -t.amountCents);

/** Unread, non-promotional inbox mail received since this local day began. */
const emailBrief: Detector = async ({ scope, tz, today }) => {
  const since = startOfLocalDay(today, tz);
  const rows = await scope.tx
    .select({ from: gmailMessages.fromAddress, subject: gmailMessages.subject, labels: gmailMessages.labels })
    .from(gmailMessages)
    .where(and(eq(gmailMessages.userId, scope.userId), eq(gmailMessages.unread, true), gte(gmailMessages.receivedAt, since)))
    .orderBy(desc(gmailMessages.receivedAt))
    .limit(20);
  const important = rows.filter((m) => !m.labels.includes("CATEGORY_PROMOTIONS") && !m.labels.includes("CATEGORY_SOCIAL")).slice(0, 4);
  if (!important.length) return [];
  const emails = important.map((m) => `${m.from}: ${m.subject}`).join(" · ");
  return [
    {
      kind: "email_brief",
      topic: "general",
      dedupeKey: `email_brief:${today}`,
      facts: { count: important.length, emails },
      action: { type: "open", label: "Open Gmail", href: "https://mail.google.com" },
      priority: 72,
    },
  ];
};

/** A category's spending this week vs. the same days of the previous 8 weeks. */
const spendingPace: Detector = async ({ scope, today }) => {
  const wk = weekStart(today);
  const span = daysBetween(wk, today);
  const txns = await queryTransactions(scope, { from: addDaysStr(wk, -56), to: today, kinds: ["expense"], limit: 5000 });
  const byCat = new Map<string, { id: string; name: string; now: number; past: number[] }>();
  for (const t of txns) {
    if (!t.categoryId || !t.categoryName) continue;
    const c = byCat.get(t.categoryId) ?? { id: t.categoryId, name: t.categoryName, now: 0, past: Array(8).fill(0) };
    if (t.date >= wk) c.now += spendOf(t);
    else {
      const w = Math.floor(daysBetween(t.date, wk) / 7.0001);
      const offset = daysBetween(addDaysStr(wk, -7 * (w + 1)), t.date);
      if (w < 8 && offset <= span) c.past[w] += spendOf(t);
    }
    byCat.set(t.categoryId, c);
  }
  const worst = [...byCat.values()]
    .map((c) => ({ ...c, usual: Math.round(c.past.reduce((a, b) => a + b, 0) / 8) }))
    .filter((c) => c.usual > 0 && c.now - c.usual >= 2000 && c.now >= c.usual * 1.3)
    .sort((a, b) => b.now - b.usual - (a.now - a.usual))[0];
  if (!worst) return [];
  const over = worst.now - worst.usual;
  // A budget with room this month can cover it.
  const budgets = await budgetStatus(scope, today);
  const to = budgets.find((b) => b.categoryId === worst.id || b.childIds.includes(worst.id));
  const from = budgets.filter((b) => b !== to && b.remainingCents >= over).sort((a, b) => b.remainingCents - a.remainingCents)[0];
  const move = Math.round(over / 500) * 500 || over;
  return [
    {
      kind: "spending_pace",
      topic: "money",
      dedupeKey: `spending_pace:${worst.id}:${wk}`,
      facts: {
        category: worst.name,
        spentCents: worst.now,
        usualCents: worst.usual,
        overCents: over,
        fromCategory: to && from ? from.categoryName : null,
        moveCents: move,
      },
      action:
        to && from
          ? {
              type: "shift_budget",
              label: `Move ${usd(move)}`,
              fromCategoryId: from.categoryId,
              toCategoryId: to.categoryId,
              cents: move,
              month: monthStart(today),
            }
          : { type: "open", label: "See spending", href: `/finances/transactions?category=${encodeURIComponent(worst.name)}` },
      priority: 70,
    },
  ];
};

/** Milestones (25/50/75/100%) and how far ahead or behind plan. */
const goalMilestones: Detector = async ({ scope, today }) => {
  const goals = await goalsWithPlans(scope, today);
  return goals
    .filter((g) => g.status === "active" && g.milestoneToCelebrate)
    .map((g) => {
      const weeksAhead = g.targetDate && g.projectedDate ? Math.round(daysBetween(g.projectedDate, g.targetDate) / 7) : 0;
      const remainingWeeks = g.targetDate ? Math.max(1, daysBetween(today, g.targetDate) / 7) : 0;
      const extra = weeksAhead < 0 && remainingWeeks ? Math.ceil((g.remainingCents / remainingWeeks - g.monthlyPaceCents / 4.345) / 500) * 500 : 0;
      return {
        kind: "goal_milestone",
        topic: "money" as const,
        dedupeKey: `goal_milestone:${g.id}:${g.milestoneToCelebrate}`,
        facts: { goal: g.name, goalId: g.id, percent: g.milestoneToCelebrate, weeksAhead, extraCents: Math.max(0, extra) },
        action: { type: "open" as const, label: "See goal", href: "/finances/goals" },
        priority: 60,
      };
    });
};

/** An assignment due soon with a shift right before it: offer a study block in free time. */
const deadlineConflicts: Detector = async ({ scope, tz, today, now }) => {
  const due = (await listAssignments(scope, tz, { view: "upcoming", now, limit: 20 })).filter(
    (a) => a.dueAt && localDateOf(a.dueAt, tz) <= addDaysStr(today, 7),
  );
  if (!due.length) return [];
  const shifts = await listShifts(scope, tz, today, addDaysStr(today, 7));
  const out: Candidate[] = [];
  for (const a of due) {
    const dueDate = localDateOf(a.dueAt!, tz);
    const shift = shifts
      .map((s) => ({ ...s, date: localDateOf(s.startsAt, tz), startTime: localTimeOf(s.startsAt, tz) }))
      .find((s) => s.date < dueDate && daysBetween(s.date, dueDate) <= 1 && s.status !== "cancelled");
    if (!shift) continue;
    // Free time the day before the shift (or today), at least 2 hours.
    let block: { date: string; start: string; end: string } | null = null;
    for (let d = addDaysStr(shift.date, -1); d >= today && !block; d = addDaysStr(d, -1)) {
      const items = await getAgenda(scope, tz, d, d, { now });
      const slot = freeSlots(items, d, tz, "09:00", "21:00", 120).find((x) => x.minutes >= 120 && x.startsAt.getTime() > now.getTime());
      if (slot) block = { date: d, start: localTimeOf(slot.startsAt, tz), end: addMinutes(localTimeOf(slot.startsAt, tz), 120) };
    }
    if (!block) continue;
    out.push({
      kind: "deadline_conflict",
      topic: "school",
      dedupeKey: `deadline_conflict:${a.id}:${shift.id}`,
      facts: {
        assignment: a.title,
        dueDay: formatDateStr(dueDate, "EEEE"),
        shiftWhen: `${formatDateStr(shift.date, "EEEE")} ${Number(shift.startTime.slice(0, 2)) >= 16 ? "night" : `at ${shift.startTime}`}`,
        blockWhen: `2 hours on ${formatDateStr(block.date, "EEEE")} at ${block.start}`,
      },
      action: { type: "block_time", label: "Block it", date: block.date, start: block.start, end: block.end, title: `Work on ${a.title}` },
      priority: 75,
    });
  }
  return out.slice(0, 2);
};

const addMinutes = (hhmm: string, mins: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + mins;
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Bills in the next 3 days; urgent when checking can't cover them. */
const billsDue: Detector = async ({ scope, today }) => {
  const bills = (await upcomingRecurring(scope, today, addDaysStr(today, 3))).filter((b) => b.amountCents < 0);
  if (!bills.length) return [];
  const accounts = await listAccounts(scope);
  if (!accounts.length) return [];
  const cash = balancesOf(accounts);
  let running = cash.cashCents;
  return bills.map((b) => {
    running += b.amountCents;
    const dueIn = relativeDayLabel(b.date, today).toLowerCase().replace(/^on /, "");
    const when = daysBetween(today, b.date) <= 1 ? dueIn : `in ${daysBetween(today, b.date)} days`;
    if (running < 0) {
      // Only this bill's part of the gap (an earlier bill may already have used the cash).
      const short = Math.min(-running, -b.amountCents);
      const options = [cash.savingsCents >= short ? `move ${usd(short)} from savings` : null, `hold spending to essentials until it clears`].filter(Boolean);
      return {
        kind: "bill_short",
        topic: "money" as const,
        dedupeKey: `bill_short:${b.id}:${b.date}`,
        facts: { bill: b.name, billCents: -b.amountCents, dueIn: when, shortCents: short, options: `Two ways to cover it: ${options.join(", or ")}.` },
        action: {
          type: "create_task" as const,
          label: "Remind me",
          title: `Cover ${b.name} (${usd(short)} short)`,
          dueDate: addDaysStr(b.date, -1) < today ? today : addDaysStr(b.date, -1),
        },
        priority: 95,
        urgent: true,
      };
    }
    return {
      kind: "bill_due",
      topic: "money" as const,
      dedupeKey: `bill_due:${b.id}:${b.date}`,
      facts: { bill: b.name, billCents: -b.amountCents, dueIn: when, cashCents: cash.cashCents },
      action: { type: "create_task" as const, label: "Remind me", title: `Pay ${b.name} (${usd(b.amountCents)})`, dueDate: b.date },
      priority: daysBetween(today, b.date) <= 1 ? 80 : 55,
      urgent: daysBetween(today, b.date) <= 1,
    };
  });
};

/** Payday today or tomorrow: a split across bills, goals, savings and fun. */
const paydaySplit: Detector = async ({ scope, today }) => {
  const forecast = await cashForecast(scope, today, 3);
  const pay = forecast.expectedPay.find((p) => p.date <= addDaysStr(today, 1));
  if (!pay) return [];
  const plan = await planPaycheck(scope, today, pay.amountCents);
  const parts = [
    plan.billsCents ? `bills ${usd(plan.billsCents)}` : null,
    plan.savingsCents ? `savings ${usd(plan.savingsCents)}` : null,
    ...plan.goals.map((g) => `${g.name} ${usd(g.cents)}`),
    plan.freeToSpendCents > 0 ? `fun ${usd(plan.freeToSpendCents)}` : null,
  ].filter(Boolean);
  return [
    {
      kind: "payday_split",
      topic: "money",
      dedupeKey: `payday_split:${pay.date}`,
      facts: { when: pay.date === today ? "today" : "tomorrow", payCents: pay.amountCents, split: parts.join(", ") },
      action: {
        type: "create_task",
        label: "Remind me",
        title: `Payday: set aside ${parts.filter((p) => !p!.startsWith("fun")).join(", ")}`,
        dueDate: pay.date,
      },
      priority: 70,
    },
  ];
};

/** Consecutive days with every due to-do finished (3+). */
const taskStreak: Detector = async ({ scope, tz, today }) => {
  const since = addDaysStr(today, -60);
  const rows = await scope.tx
    .select({ dueAt: tasks.dueAt, status: tasks.status, completedAt: tasks.completedAt })
    .from(tasks)
    .where(and(eq(tasks.userId, scope.userId), isNotNull(tasks.dueAt), gte(tasks.dueAt, new Date(`${since}T00:00:00Z`))));
  const byDay = new Map<string, { due: number; done: number }>();
  for (const t of rows) {
    const d = localDateOf(t.dueAt!, tz);
    if (d > today) continue;
    const e = byDay.get(d) ?? { due: 0, done: 0 };
    e.due++;
    if (t.status === "done") e.done++;
    byDay.set(d, e);
  }
  const days = [...byDay.keys()].sort().reverse();
  const run = (start: number) => {
    let n = 0;
    for (let i = start; i < days.length && byDay.get(days[i])!.done === byDay.get(days[i])!.due; i++) n++;
    return n;
  };
  if (!days.length || days[0] !== today || byDay.get(today)!.done !== byDay.get(today)!.due) return [];
  const current = run(0);
  if (current < 3) return [];
  let best = 0;
  for (let i = current; i < days.length; i++) best = Math.max(best, run(i));
  return [{ kind: "task_streak", topic: "habits", dedupeKey: `task_streak:${today}`, facts: { days: current, best: current > best }, priority: 50 }];
};

/** Manual-only users who stopped logging spending for 4+ days. */
const logReminder: Detector = async ({ scope, today }) => {
  const accounts = await listAccounts(scope);
  if (!accounts.length || accounts.some((a) => a.source === "plaid")) return [];
  const [last] = await queryTransactions(scope, { kinds: ["expense"], limit: 1 });
  if (!last) return [];
  const days = daysBetween(last.date, today);
  if (days < 4) return [];
  return [
    {
      kind: "log_reminder",
      topic: "money",
      dedupeKey: `log_reminder:${last.date}`,
      facts: { days },
      action: { type: "open", label: "Log spending", href: "/money?add=spending" },
      priority: 45,
    },
  ];
};

/** Early in the month: saved more last month than the month before? */
const savedMore: Detector = async ({ scope, today }) => {
  if (Number(today.slice(8, 10)) > 7) return [];
  const last = monthStart(addDaysStr(monthStart(today), -1));
  const prev = monthStart(addDaysStr(last, -1));
  const txns = await queryTransactions(scope, { from: prev, to: addDaysStr(monthStart(today), -1), kinds: ["expense", "income"], limit: 10000 });
  const net = (from: string, to: string) => txns.filter((t) => t.date >= from && t.date < to).reduce((s, t) => s + t.amountCents, 0);
  const saved = net(last, monthStart(today));
  const before = net(prev, last);
  const more = saved - before;
  if (saved <= 0 || more < 2500) return [];
  const goal = (await goalsWithPlans(scope, today))
    .filter((g) => g.status === "active" && g.remainingCents > 0)
    .sort((a, b) => a.remainingCents - b.remainingCents)[0];
  const move = goal ? Math.min(more, goal.remainingCents) : 0;
  return [
    {
      kind: "saved_more",
      topic: "money",
      dedupeKey: `saved_more:${last}`,
      facts: { month: formatDateStr(last, "MMMM"), savedCents: saved, moreCents: more, goal: goal?.name ?? null, moveCents: move },
      action: goal ? { type: "contribute_goal", label: `Add ${usd(move)} to ${goal.name}`, goalId: goal.id, cents: move } : undefined,
      priority: 60,
    },
  ];
};

/** To-dos past due: offer to move them to tomorrow. */
const overdueTasks: Detector = async ({ scope, tz, today }) => {
  const rows = await scope.tx
    .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.userId, scope.userId), ne(tasks.status, "done"), isNotNull(tasks.dueAt), lt(tasks.dueAt, new Date())));
  const late = rows.filter((t) => localDateOf(t.dueAt!, tz) < today || t.dueAt!.getTime() < Date.now() - 3600_000).slice(0, 5);
  if (!late.length) return [];
  const titles =
    late
      .slice(0, 2)
      .map((t) => `"${t.title}"`)
      .join(" and ") + (late.length > 2 ? ` and ${late.length - 2} more` : "");
  return [
    {
      kind: "overdue_tasks",
      topic: "general",
      dedupeKey: `overdue_tasks:${today}`,
      facts: { count: late.length, titles },
      action: { type: "move_tasks", label: "Move to tomorrow", taskIds: late.map((t) => t.id), to: addDaysStr(today, 1) },
      priority: 55,
    },
  ];
};

/** A recent charge far above what the user usually pays that merchant. */
const unusualSpend: Detector = async ({ scope, today }) => {
  const txns = await queryTransactions(scope, { from: addDaysStr(today, -120), to: today, kinds: ["expense"], limit: 5000 });
  const recent = txns.filter((t) => t.date >= addDaysStr(today, -2) && spendOf(t) >= 5000);
  const out: Candidate[] = [];
  for (const t of recent) {
    const key = merchantKey(t);
    const history = txns.filter((x) => x.id !== t.id && merchantKey(x) === key).map(spendOf);
    if (history.length < 3) continue;
    const median = history.sort((a, b) => a - b)[Math.floor(history.length / 2)];
    if (median <= 0 || spendOf(t) < median * 3) continue;
    out.push({
      kind: "unusual_spend",
      topic: "money",
      dedupeKey: `unusual_spend:${t.id}`,
      facts: { merchant: t.merchantName ?? t.description, amountCents: spendOf(t), times: Math.round(spendOf(t) / median) },
      action: { type: "open", label: "Review it", href: `/finances/transactions?q=${encodeURIComponent(t.merchantName ?? t.description)}` },
      priority: 65,
    });
  }
  return out.slice(0, 1);
};

/** Subscriptions: price increases, trials about to turn paid, and new recurring charges. */
const subscriptionWatch: Detector = async ({ scope, today }) => {
  const o = await subscriptionsOverview(scope, today);
  const out: Candidate[] = [];
  for (const f of o.flags) {
    if (f.kind === "price_up")
      out.push({
        kind: "subscription_price_up",
        topic: "money",
        dedupeKey: `sub_price:${f.id}:${f.toCents}`,
        facts: { name: f.name, fromCents: f.fromCents, toCents: f.toCents, yearlyExtraCents: f.yearlyExtraCents },
        action: { type: "open", label: "Review it", href: "/finances/subscriptions" },
        priority: 70,
      });
    if (f.kind === "trial")
      out.push({
        kind: "trial_ending",
        topic: "money",
        dedupeKey: `trial:${f.id}:${today.slice(0, 7)}`,
        facts: { name: f.name, daysLeft: f.daysLeft, thenCents: f.thenCents },
        action: { type: "open", label: "Keep or cancel", href: "/finances/subscriptions" },
        priority: f.daysLeft <= 2 ? 90 : 70,
        urgent: f.daysLeft <= 2,
      });
  }
  for (const c of o.found.slice(0, 1))
    out.push({
      kind: "new_subscription",
      topic: "money",
      dedupeKey: `sub_found:${c.merchantKey}`,
      facts: { name: c.name, amountCents: -c.averageAmountCents, count: c.occurrences },
      action: { type: "open", label: "Take a look", href: "/finances/subscriptions" },
      priority: 50,
    });
  return out;
};

/** Early each month: checks the biggest comparable bill for a cheaper, sourced option. Uses a live web search. */
const savingsCheck: Detector = async ({ scope, today }) => {
  if (Number(today.slice(8, 10)) > 7 || !webSearchClient()) return [];
  const [{ bills }, { rows }] = [await billsToReview(scope), await listSavings(scope)];
  const recent = new Set(rows.filter((r) => r.searchedAt.getTime() > Date.now() - 30 * 86_400_000).map((r) => r.recurringId));
  const bill = bills.filter((b) => !recent.has(b.id)).sort((a, b) => b.monthlyCents - a.monthlyCents)[0];
  if (!bill) return [];
  const found = await findSavings(scope, { recurringId: bill.id }).catch(() => null);
  const best = found?.saved.sort((a, b) => b.yearlySavingsCents - a.yearlySavingsCents)[0];
  if (!best) return [];
  return [
    {
      kind: "savings_found",
      topic: "money",
      dedupeKey: `savings_found:${bill.id}:${today.slice(0, 7)}`,
      facts: { bill: bill.name, provider: best.provider, plan: best.plan, yearlyCents: best.yearlySavingsCents, source: best.sourceTitle },
      action: { type: "open", label: "See it and the source", href: "/finances/savings" },
      priority: 65,
    },
  ];
};

export const DETECTORS = {
  emailBrief,
  spendingPace,
  goalMilestones,
  deadlineConflicts,
  billsDue,
  paydaySplit,
  taskStreak,
  logReminder,
  savedMore,
  overdueTasks,
  unusualSpend,
  morningBrief,
  eveningWrap,
  weeklyReview,
  weeklyLearned,
  monthlyReview,
  goalForecast,
  habitCoach,
  subscriptionWatch,
  savingsCheck,
};
export type DetectorName = keyof typeof DETECTORS;

/** Which detectors run when. Events run right after the change that triggered them. */
export const RUNS: Record<string, DetectorName[]> = {
  morning: ["emailBrief", "morningBrief", "monthlyReview", "savingsCheck", "billsDue", "paydaySplit", "deadlineConflicts", "goalMilestones", "savedMore"],
  midday: ["spendingPace", "unusualSpend", "logReminder", "billsDue", "overdueTasks", "subscriptionWatch"],
  // The evening wrap-up offers to move what's left, so late to-dos are raised at midday.
  evening: ["eveningWrap", "weeklyReview", "weeklyLearned", "goalForecast", "habitCoach", "taskStreak", "goalMilestones", "deadlineConflicts"],
  transaction: ["spendingPace", "unusualSpend", "billsDue", "goalMilestones"],
  shift: ["deadlineConflicts"],
  goal: ["goalMilestones"],
  task: ["taskStreak"],
};
