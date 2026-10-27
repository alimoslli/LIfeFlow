import { series } from "@/server/db/series";
import { addDaysStr, monthStart, todayIn } from "@/lib/dates";
import type { SessionUser } from "@/server/auth/sessions";
import type { UserScope } from "@/server/db/with-user";
import { findConflicts, getAgenda } from "@/server/services/calendar";
import { listAccounts, summarizeBalances } from "@/server/services/finance/accounts";
import { spendingSummary } from "@/server/services/finance/insights";
import { budgetStatus, listGoals, upcomingRecurring } from "@/server/services/finance/planning";
import { listAssignments } from "@/server/services/school";
import { listTasks } from "@/server/services/tasks";

/** Everything the Home dashboard shows, in one RLS-scoped pass. */
export async function loadHome(s: UserScope, user: SessionUser) {
  const tz = user.timezone;
  const now = new Date();
  const today = todayIn(tz, now);
  const [agenda, tasks, overdue, upcoming, accounts, month, budgets, goals, bills] = await series(() => getAgenda(s, tz, today, today, { include: ["event", "shift"], now }), () => listTasks(s, { status: "open", topLevelOnly: true, limit: 40 }), () => listAssignments(s, tz, { view: "overdue", now, limit: 10 }), () => listAssignments(s, tz, { view: "upcoming", now, limit: 20 }), () => listAccounts(s), () => spendingSummary(s, { from: monthStart(today), to: today }), () => budgetStatus(s, today), () => listGoals(s), () => upcomingRecurring(s, today, addDaysStr(today, 7)));
  const weekEnd = addDaysStr(today, 7);
  const tasksDueSoon = tasks.filter((t) => t.dueAt && t.dueAt <= new Date(Date.now() + 7 * 86_400_000));
  return {
    tz,
    now,
    today,
    agenda,
    conflicts: findConflicts(agenda),
    tasks,
    priorityTasks: [...tasks].sort((a, b) => rank(a) - rank(b)).slice(0, 6),
    overdue,
    deadlines: upcoming.filter((a) => a.dueAt && a.dueAt.toISOString().slice(0, 10) <= weekEnd),
    tasksDueSoon,
    accounts,
    balances: summarizeBalances(accounts),
    month,
    budgets,
    goals: goals.slice(0, 3),
    bills: bills.filter((b) => b.amountCents < 0),
  };
}

const PR = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
function rank(t: { priority: keyof typeof PR; dueAt: Date | null }) {
  const days = t.dueAt ? (t.dueAt.getTime() - Date.now()) / 86_400_000 : 30;
  return PR[t.priority] * 3 + Math.max(-3, Math.min(days, 30)) / 3;
}

export type HomeData = Awaited<ReturnType<typeof loadHome>>;
