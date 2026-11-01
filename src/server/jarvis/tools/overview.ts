import { series } from "@/server/db/series";
import { z } from "zod";
import { addDaysStr, localDateOf, monthStart } from "@/lib/dates";
import { findConflicts, getAgenda } from "../../services/calendar";
import { listAccounts, summarizeBalances } from "../../services/finance/accounts";
import { spendingSummary } from "../../services/finance/insights";
import { budgetStatus } from "../../services/finance/planning";
import { listAssignments } from "../../services/school";
import { listTasks } from "../../services/tasks";
import { presentAgendaItem } from "./calendar";
import { centsToDollarsDeep } from "./finance";
import { presentAssignment } from "./school";
import { presentTask } from "./tasks";
import { defineTool } from "../tool";

export const overviewTools = [
  defineTool({
    name: "get_daily_briefing",
    description:
      "A snapshot across modules: today's schedule, overdue and due-soon tasks/assignments, conflicts, cash position, month-to-date spending and budgets near their limit. Good first call for 'what do I need to do today' or 'summarize my situation'.",
    schema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    mutates: false,
    async execute(a, ctx) {
      const day = a.date ?? ctx.today;
      return ctx.run(async (s) => {
        const [agenda, tasks, overdue, week, accounts, month, budgets] = await series(
          () => getAgenda(s, ctx.tz, day, day, { now: ctx.now }),
          () => listTasks(s, { status: "open", limit: 15 }),
          () => listAssignments(s, ctx.tz, { view: "overdue", now: ctx.now, limit: 10 }),
          () => listAssignments(s, ctx.tz, { view: "upcoming", now: ctx.now, limit: 10 }),
          () => listAccounts(s),
          () => spendingSummary(s, { from: monthStart(day), to: day }),
          () => budgetStatus(s, day),
        );
        const soon = addDaysStr(day, 7);
        return centsToDollarsDeep({
          date: day,
          schedule: agenda.map((i) => presentAgendaItem(i, ctx)),
          conflicts: findConflicts(agenda).map((c) => `${c.a.title} overlaps ${c.b.title}`),
          openTasks: tasks.map((t) => presentTask(t, ctx)),
          overdueAssignments: overdue.map((x) => presentAssignment(x, ctx)),
          // Local due dates and times ("2026-11-04 23:59"), never UTC, so a late-night deadline isn't read as the next day.
          assignmentsNext7Days: week.filter((x) => x.dueAt && localDateOf(x.dueAt, ctx.tz) <= soon).map((x) => presentAssignment(x, ctx)),
          money: ctx.moneyLocked
            ? { locked: "Money is locked with Face ID on this device. The user can unlock it in the Money tab." }
            : accounts.length
              ? {
                  balances: summarizeBalances(accounts),
                  monthToDate: { incomeCents: month.incomeCents, netSpendingCents: month.netSpendingCents, topCategories: month.topCategories.slice(0, 4) },
                  budgetsOver80Percent: budgets
                    .filter((b) => b.percent >= 80)
                    .map((b) => ({ category: b.categoryName, percent: b.percent, remainingCents: b.remainingCents })),
                  dataSources: month.dataSources,
                }
              : { note: "No financial accounts yet." },
        });
      });
    },
  }),
];
