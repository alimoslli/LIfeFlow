import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE } from "@/lib/dates";
import { tasks, workShifts } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { createTransaction } from "./finance/transactions";
import { createTask, updateTask } from "./tasks";
import { createShift } from "./work";

/**
 * Writes made while offline, replayed when the phone is back online. Each op
 * carries an id made on the device, so replaying it twice never duplicates
 * anything (the id becomes the row id, or the transaction's provider id).
 */
export const offlineOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task.create"),
    id: z.string().uuid(),
    data: z.object({
      title: z.string().trim().min(1).max(300),
      dueDate: z.string().regex(DATE_RE).nullish(),
      dueTime: z.string().regex(TIME_RE).nullish(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    }),
  }),
  z.object({ kind: z.literal("task.status"), id: z.string().uuid(), data: z.object({ taskId: z.string().uuid(), done: z.boolean() }) }),
  z.object({
    kind: z.literal("transaction.create"),
    id: z.string().uuid(),
    data: z.object({
      accountId: z.string().uuid(),
      amountCents: z.number().int().positive(),
      description: z.string().trim().min(1).max(300),
      date: z.string().regex(DATE_RE),
    }),
  }),
  z.object({
    kind: z.literal("shift.create"),
    id: z.string().uuid(),
    data: z.object({
      employerId: z.string().uuid(),
      date: z.string().regex(DATE_RE),
      startTime: z.string().regex(TIME_RE),
      endTime: z.string().regex(TIME_RE),
      breakMinutes: z.number().int().min(0).max(600).optional(),
    }),
  }),
]);
export type OfflineOp = z.infer<typeof offlineOpSchema>;

export type ReplayResult = { id: string; status: "applied" | "already_applied" | "failed"; error?: string };

export async function replayOp(scope: UserScope, tz: string, op: OfflineOp): Promise<Omit<ReplayResult, "id">> {
  switch (op.kind) {
    case "task.create": {
      const [exists] = await scope.tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, op.id), eq(tasks.userId, scope.userId)));
      if (exists) return { status: "already_applied" };
      await createTask(
        scope,
        tz,
        { title: op.data.title, dueDate: op.data.dueDate, dueTime: op.data.dueDate ? op.data.dueTime : null, priority: op.data.priority ?? "medium" },
        "manual",
        { id: op.id },
      );
      return { status: "applied" };
    }
    case "task.status": {
      // Sets the state the user saw, so replaying is idempotent.
      await updateTask(scope, tz, op.data.taskId, { status: op.data.done ? "done" : "todo" });
      return { status: "applied" };
    }
    case "transaction.create": {
      const row = await createTransaction(
        scope,
        { accountId: op.data.accountId, amountCents: -op.data.amountCents, description: op.data.description, date: op.data.date },
        "manual",
        `offline:${op.id}`,
      );
      return { status: row ? "applied" : "already_applied" };
    }
    case "shift.create": {
      const [exists] = await scope.tx
        .select({ id: workShifts.id })
        .from(workShifts)
        .where(and(eq(workShifts.id, op.id), eq(workShifts.userId, scope.userId)));
      if (exists) return { status: "already_applied" };
      await createShift(scope, tz, op.data, "manual", { id: op.id });
      return { status: "applied" };
    }
  }
}
