import { addDaysStr, daysBetween, monthStart, todayIn } from "@/lib/dates";
import type { SessionUser } from "../auth/sessions";
import { series } from "../db/series";
import type { UserScope } from "../db/with-user";
import { freeSlots, getAgenda } from "../services/calendar";
import { listAccounts, summarizeBalances } from "../services/finance/accounts";
import { DEFAULT_CATEGORIES } from "../services/finance/categories";
import { budgetStatus, listGoals, monthlyContributionNeeded, upcomingRecurring } from "../services/finance/planning";
import { merchantKey } from "../services/finance/recurring-detect";
import { queryTransactions } from "../services/finance/transactions";
import { summarizeCashflow } from "../services/finance/cashflow";
import { listAssignments } from "../services/school";
import { listTasks } from "../services/tasks";
import type { LifeSnapshot, MoneySnapshot } from "./types";

/** Reads everything the briefing needs, in one RLS-scoped pass. */
export async function collectSnapshot(s: UserScope, user: SessionUser, now = new Date()): Promise<LifeSnapshot> {
  const tz = user.timezone;
  const today = todayIn(tz, now);
  const weekEnd = addDaysStr(today, 6);
  const [week, overdueA, upcomingA, tasks] = await series(
    () => getAgenda(s, tz, today, weekEnd, { now }),
    () => listAssignments(s, tz, { view: "overdue", now, limit: 10 }),
    () => listAssignments(s, tz, { view: "upcoming", now, limit: 40 }),
    () => listTasks(s, { status: "open", limit: 100 }),
  );
  const overdueTasks = tasks.filter((t) => t.dueAt && t.dueAt < now && !t.parentId);
  const blocking = week.filter((i) => i.blocksTime);
  const freeMinutesByDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(today, i);
    const slots = freeSlots(blocking, date, tz, "08:00", "22:00", 60).filter((x) => x.endsAt > now);
    const morning = freeSlots(blocking, date, tz, "08:00", "12:00", 45).filter((x) => x.endsAt > now);
    return {
      date,
      minutes: slots.reduce((a, x) => a + x.minutes, 0),
      longest: Math.max(0, ...slots.map((x) => x.minutes)),
      morningMinutes: morning.reduce((a, x) => a + x.minutes, 0),
    };
  });
  const horizon = addDaysStr(today, 14);
  return {
    now,
    tz,
    today,
    firstName: user.name.split(" ")[0],
    studyTime: user.preferences?.studyTime,
    week,
    overdue: [
      ...overdueA.map((a) => ({ id: a.id, title: a.title, context: a.course.code ?? a.course.name, dueAt: a.dueAt!, kind: "assignment" as const, href: `/school/courses/${a.course.id}` })),
      ...overdueTasks.map((t) => ({ id: t.id, title: t.title, context: "Task", dueAt: t.dueAt!, kind: "task" as const, href: "/tasks" })),
    ].sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime()),
    exams: upcomingA
      .filter((a) => (a.kind === "exam" || a.kind === "quiz") && a.dueAt && a.dueAt.toISOString().slice(0, 10) <= horizon)
      .map((a) => ({ id: a.id, title: a.title, course: a.course.code ?? a.course.name, dueAt: a.dueAt!, kind: a.kind, href: `/school/courses/${a.course.id}` })),
    freeMinutesByDay,
    money: await collectMoney(s, today),
  };
}

async function collectMoney(s: UserScope, today: string): Promise<MoneySnapshot | null> {
  const accounts = await listAccounts(s);
  if (!accounts.length) return null;
  const balances = summarizeBalances(accounts);
  const upcoming = await upcomingRecurring(s, today, addDaysStr(today, 35));
  const nextIncome = upcoming.find((u) => u.amountCents > 0) ?? null;
  const mStart = monthStart(today);
  const span = daysBetween(mStart, today);
  const lastStart = monthStart(addDaysStr(mStart, -1));
  const lastSameDay = addDaysStr(lastStart, span);
  const [thisMonth, lastMonth, budgets, goals] = await series(
    () => queryTransactions(s, { from: mStart, to: today, limit: 5000 }),
    () => queryTransactions(s, { from: lastStart, to: lastSameDay, limit: 5000 }),
    () => budgetStatus(s, today),
    () => listGoals(s),
  );
  const byMerchant = (rows: typeof thisMonth, catName: string) => {
    const m = new Map<string, { name: string; cents: number }>();
    for (const t of rows) {
      if (t.kind !== "expense" || !t.categoryName) continue;
      if (t.categoryName !== catName && !catChildren(catName).includes(t.categoryName)) continue;
      const k = merchantKey(t);
      const cur = m.get(k) ?? { name: t.merchantName ?? t.description, cents: 0 };
      cur.cents -= t.amountCents;
      m.set(k, cur);
    }
    return m;
  };
  const overBudget = budgets
    .filter((b) => b.remainingCents < 0)
    .map((b) => {
      const now = byMerchant(thisMonth, b.categoryName);
      const before = byMerchant(lastMonth, b.categoryName);
      let top: { name: string; change: number } | null = null;
      for (const [k, v] of now) {
        const change = v.cents - (before.get(k)?.cents ?? 0);
        if (!top || change > top.change) top = { name: v.name, change };
      }
      return { category: b.categoryName, spentCents: b.spentCents, limitCents: b.limitCents, topMerchant: top?.name ?? null, topMerchantChangeCents: top?.change ?? null };
    });
  const in30 = addDaysStr(today, 30);
  const spendable = accounts.filter((a) => (a.type === "depository" || a.type === "cash") && !/saving/i.test(`${a.subtype ?? ""} ${a.name}`));
  return {
    cashCents: balances.cashCents,
    spendableCashCents: spendable.reduce((sum, a) => sum + a.currentBalanceCents, 0),
    incomeNext30: upcoming.filter((u) => u.amountCents > 0 && u.date <= in30).map((u) => ({ date: u.date, amountCents: u.amountCents, name: u.name })),
    billsNext30: upcoming.filter((u) => u.amountCents < 0 && u.date <= in30).map((u) => ({ name: u.name, date: u.date, amountCents: u.amountCents })),
    creditOwedCents: balances.creditOwedCents,
    nextIncome: nextIncome ? { date: nextIncome.date, amountCents: nextIncome.amountCents, name: nextIncome.name } : null,
    monthToDateSpendCents: summarizeCashflow(thisMonth).netSpendingCents,
    lastMonthSameSpanSpendCents: summarizeCashflow(lastMonth).netSpendingCents,
    overBudget,
    goals: goals.map((g) => ({ name: g.name, percent: g.percent, targetDate: g.targetDate, monthlyNeededCents: monthlyContributionNeeded(g.targetCents, g.savedCents, g.targetDate, today) })),
    hasDemoData: accounts.some((a) => a.source === "demo"),
  };
}

/** Budget categories are top-level groups; transactions usually carry a subcategory. */
function catChildren(name: string) {
  return DEFAULT_CATEGORIES.find((c) => c.name === name)?.children ?? [];
}
