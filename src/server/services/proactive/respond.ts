import { eq } from "drizzle-orm";
import { formatDateStr } from "@/lib/dates";
import { jarvisMessages, tasks, type ProactiveAction, type UserPreferences } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { getDb } from "../../db/client";
import { updatePreferences } from "../accounts";
import { createEvent, deleteEvent } from "../calendar";
import { ServiceError } from "../errors";
import { contributeToGoal, deleteContribution } from "../finance/goals";
import { createMemory, deleteMemory } from "../memory";
import { budgetStatus, setBudget } from "../finance/planning";
import { createTask, deleteTask, updateTask } from "../tasks";
import { getMessage, jarvisSettings, tomorrowMorning } from "./engine";
import { questionByKey } from "./questions";

export type Response = "do" | "snooze" | "dismiss" | "mute" | "up" | "down" | "undo" | "answer";
type User = { id: string; timezone: string; preferences?: UserPreferences };

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
/** Actions that touch money: "Do it" on the card (which states the exact amount) is the confirmation. */
export const isMoneyAction = (a: ProactiveAction | null) => a?.type === "shift_budget" || a?.type === "contribute_goal";

/** Carries out a message's action. Returns what changed and how to undo it. */
export async function performAction(
  scope: UserScope,
  tz: string,
  a: ProactiveAction,
  today: string,
): Promise<{ text: string; undo?: Record<string, unknown>; href?: string }> {
  switch (a.type) {
    case "shift_budget": {
      const budgets = await budgetStatus(scope, a.month);
      const from = budgets.find((b) => b.categoryId === a.fromCategoryId);
      const to = budgets.find((b) => b.categoryId === a.toCategoryId);
      if (!from || !to) throw new ServiceError("Those budgets changed since this message. Open Budgets to adjust them.");
      if (from.limitCents < a.cents) throw new ServiceError(`${from.categoryName}'s budget is smaller than ${usd(a.cents)} now.`);
      await setBudget(scope, { month: a.month, categoryId: from.categoryId, limitCents: from.limitCents - a.cents });
      await setBudget(scope, { month: a.month, categoryId: to.categoryId, limitCents: to.limitCents + a.cents });
      return {
        text: `Moved ${usd(a.cents)} from ${from.categoryName} (now ${usd(from.limitCents - a.cents)}) to ${to.categoryName} (now ${usd(to.limitCents + a.cents)}).`,
        undo: {
          budgets: [
            { categoryId: from.categoryId, limitCents: from.limitCents },
            { categoryId: to.categoryId, limitCents: to.limitCents },
          ],
          month: a.month,
        },
      };
    }
    case "block_time": {
      const ev = await createEvent(scope, tz, { title: a.title, date: a.date, startTime: a.start, endTime: a.end, kind: "study" });
      return { text: `Blocked ${formatDateStr(a.date, "EEE, MMM d")} ${a.start} to ${a.end} for "${a.title}".`, undo: { eventId: ev.id } };
    }
    case "create_task": {
      const t = await createTask(scope, tz, { title: a.title, dueDate: a.dueDate ?? today, reminder: "at_time" });
      return { text: `Added the to-do "${a.title}"${a.dueDate ? ` for ${formatDateStr(a.dueDate, "EEE, MMM d")}` : ""}.`, undo: { taskId: t.id } };
    }
    case "move_tasks": {
      const before = await scope.tx.select({ id: tasks.id, dueAt: tasks.dueAt, dueAllDay: tasks.dueAllDay }).from(tasks).where(eq(tasks.userId, scope.userId));
      const moved = before.filter((t) => a.taskIds.includes(t.id));
      for (const t of moved) await updateTask(scope, tz, t.id, { dueDate: a.to });
      return {
        text: `Moved ${moved.length} to-do${moved.length === 1 ? "" : "s"} to ${formatDateStr(a.to, "EEEE")}.`,
        undo: { tasks: moved.map((t) => ({ id: t.id, dueAt: t.dueAt?.toISOString() ?? null, dueAllDay: t.dueAllDay })) },
      };
    }
    case "contribute_goal": {
      const c = await contributeToGoal(scope, { goalId: a.goalId, amountCents: a.cents, date: today, note: "From Jarvis" });
      return {
        text: `Recorded ${usd(a.cents)} toward your goal. (LifeFlow doesn't move money; set it aside in your bank too.)`,
        undo: { contributionId: c.contribution.id },
      };
    }
    case "open":
      return { text: "Opened.", href: a.href };
    case "ask":
      return { text: "Asked Jarvis.", href: `/jarvis?ask=${encodeURIComponent(a.prompt)}` };
    case "consent":
      return { text: "Thanks. I'll learn from how you respond, and you can turn it off in Settings." };
    case "answer":
      throw new ServiceError("Pick one of the answers.");
  }
}

async function undoAction(scope: UserScope, undo: Record<string, unknown>) {
  if (Array.isArray(undo.budgets))
    for (const b of undo.budgets as { categoryId: string; limitCents: number }[]) await setBudget(scope, { month: String(undo.month), ...b });
  if (typeof undo.eventId === "string") await deleteEvent(scope, undo.eventId);
  if (typeof undo.taskId === "string") await deleteTask(scope, undo.taskId);
  if (typeof undo.contributionId === "string") await deleteContribution(scope, undo.contributionId);
  if (typeof undo.memoryId === "string") await deleteMemory(scope, undo.memoryId).catch(() => undefined);
  if (Array.isArray(undo.tasks))
    for (const t of undo.tasks as { id: string; dueAt: string | null; dueAllDay: boolean }[])
      await scope.tx
        .update(tasks)
        .set({ dueAt: t.dueAt ? new Date(t.dueAt) : null, dueAllDay: t.dueAllDay })
        .where(eq(tasks.id, t.id));
}

/** A button on a Jarvis message. Every response is kept; it's how Jarvis learns what helps. */
export async function respondToMessage(scope: UserScope, user: User, id: string, response: Response, today: string, value?: string) {
  const m = await getMessage(scope, id);
  if (!m) throw new ServiceError("That message is gone.", "not_found");
  const set = (patch: Partial<typeof jarvisMessages.$inferInsert>) => scope.tx.update(jarvisMessages).set(patch).where(eq(jarvisMessages.id, id));
  switch (response) {
    case "do": {
      if (m.status === "done") return { text: m.result?.text ?? "Already done." };
      if (!m.action) {
        await set({ status: "done", actedAt: new Date() });
        return { text: "Got it." };
      }
      const r = await performAction(scope, user.timezone, m.action, today);
      if (m.action.type === "consent") await setJarvis(user, { learning: true });
      await set({ status: "done", actedAt: new Date(), result: { text: r.text, undo: r.undo } });
      return r;
    }
    case "undo": {
      if (m.status !== "done" || !m.result?.undo || m.result.undone) throw new ServiceError("There's nothing to undo here.");
      await undoAction(scope, m.result.undo);
      await set({ status: "dismissed", result: { ...m.result, undone: true, text: `Undone: ${m.result.text}` } });
      return { text: "Undone." };
    }
    case "answer": {
      const q = m.action?.type === "answer" ? questionByKey(m.action.key) : undefined;
      if (!q || !value || !q.choices.includes(value)) throw new ServiceError("Pick one of the answers.");
      if (m.status === "done") return { text: m.result?.text ?? "Already answered." };
      const content = q.memory(value);
      const { memory, duplicate } = await createMemory(scope, { content, category: q.category }, "user");
      const text = `Saved to what I know about you: "${content}"`;
      await set({ status: "done", actedAt: new Date(), result: { text, undo: duplicate ? undefined : { memoryId: memory.id } } });
      return { text };
    }
    case "snooze":
      await set({ status: "snoozed", snoozedUntil: tomorrowMorning(user.timezone) });
      return { text: "I'll bring it back tomorrow morning." };
    case "dismiss":
      await set({ status: "dismissed" });
      if (m.kind === "consent") await setJarvis(user, { learning: false });
      return { text: "Okay, not now." };
    case "mute": {
      const muted = new Set(jarvisSettings(user.preferences).mutedKinds);
      muted.add(m.kind);
      await setJarvis(user, { mutedKinds: [...muted] });
      await set({ status: "muted" });
      return { text: "I won't suggest this again. You can bring it back in Settings, What Jarvis knows." };
    }
    case "up":
    case "down":
      await set({ rating: response === "up" ? 1 : -1 });
      return { text: response === "up" ? "Thanks, more like this." : "Thanks, I'll adjust." };
  }
}

export async function setJarvis(user: User, patch: Partial<NonNullable<UserPreferences["jarvis"]>>) {
  await updatePreferences(getDb(), user.id, { jarvis: { ...user.preferences?.jarvis, ...patch } });
  user.preferences = { ...user.preferences, jarvis: { ...user.preferences?.jarvis, ...patch } };
}
