import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { pushSubscriptions, tasks, transactions, workShifts } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { replayOp, offlineOpSchema } from "@/server/services/offline";
import { listSubscriptions, runNotifications, saveSubscription, sendOnce, type PushMessage, type Sender } from "@/server/services/push";
import { createTask } from "@/server/services/tasks";
import { createEmployer } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const sub = () => ({
  endpoint: `https://push.example.com/send/${randomUUID()}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

function fakeSender(result: { ok: boolean; gone: boolean } = { ok: true, gone: false }) {
  const sent: PushMessage[] = [];
  const send: Sender = async (_s, msg) => {
    sent.push(msg);
    return result;
  };
  return { sent, send };
}

// 13:30 UTC = 09:30 in New York (EDT).
const NOW = new Date("2026-10-28T13:30:00Z");

describe("push notifications", () => {
  it("sends each notification at most once and drops devices the push service says are gone", async () => {
    const { run } = await makeUser();
    await run((s) => saveSubscription(s, sub()));
    const { sent, send } = fakeSender();
    expect(await run((s) => sendOnce(s, "test:1", { title: "Hi", body: "", url: "/" }, send))).toBe(true);
    expect(await run((s) => sendOnce(s, "test:1", { title: "Hi", body: "", url: "/" }, send))).toBe(false);
    expect(sent).toHaveLength(1);

    const gone = fakeSender({ ok: false, gone: true });
    expect(await run((s) => sendOnce(s, "test:2", { title: "Hi", body: "", url: "/" }, gone.send))).toBe(false);
    expect(await run(listSubscriptions)).toHaveLength(0);
  });

  it("sends due to-do reminders once each, only to users with a device, and only when reminders are on", async () => {
    const { run } = await makeUser();
    const none = fakeSender();
    expect(await run((s) => runNotifications(s, TZ, undefined, none.send, NOW))).toEqual({ sent: 0 });
    await run((s) => saveSubscription(s, sub()));
    const task = await run((s) => createTask(s, TZ, { title: "Call the bank", dueDate: "2026-10-28", dueTime: "10:00", reminder: "1h" }));

    const off = fakeSender();
    await run((s) => runNotifications(s, TZ, { notifications: { reminders: false } }, off.send, NOW));
    expect(off.sent).toHaveLength(0);

    const { sent, send } = fakeSender();
    expect((await run((s) => runNotifications(s, TZ, undefined, send, NOW))).sent).toBe(1);
    expect(sent[0]).toMatchObject({ title: "Call the bank", body: "Due at 10:00", url: `/tasks/${task.id}` });
    // Running again (the scheduler calls often) sends nothing new. Bills and the brief come from Jarvis (proactive tests).
    const again = fakeSender();
    expect((await run((s) => runNotifications(s, TZ, undefined, again.send, new Date(NOW.getTime() + 10 * 60_000)))).sent).toBe(0);
  });

  it("never lets one account take over another account's device", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const shared = sub();
    await a.run((s) => saveSubscription(s, shared));
    // Row-level security refuses the update; the route turns this into 409 and the browser re-subscribes.
    await expect(b.run((s) => saveSubscription(s, shared))).rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await a.run(listSubscriptions)).toHaveLength(1);
    expect(await b.run((s) => s.tx.select().from(pushSubscriptions))).toHaveLength(0);
  });
});

describe("offline changes", () => {
  it("replays each queued change once, even if the phone sends it twice", async () => {
    const { run } = await makeUser();
    const acct = await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 50_000 }));
    const job = await run((s) => createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 }));
    const ops = [
      { kind: "task.create", id: randomUUID(), data: { title: "Buy stamps", dueDate: "2026-10-30", dueTime: "09:00", priority: "high" } },
      { kind: "transaction.create", id: randomUUID(), data: { accountId: acct.id, amountCents: 1250, description: "Lunch", date: "2026-10-28" } },
      { kind: "shift.create", id: randomUUID(), data: { employerId: job.id, date: "2026-10-31", startTime: "12:00", endTime: "16:00" } },
    ].map((o) => offlineOpSchema.parse(o));

    for (const op of ops) expect((await run((s) => replayOp(s, TZ, op))).status).toBe("applied");
    for (const op of ops) expect((await run((s) => replayOp(s, TZ, op))).status).toBe("already_applied");

    const [task] = await run((s) => s.tx.select().from(tasks));
    expect(task).toMatchObject({ id: ops[0].id, title: "Buy stamps", priority: "high", dueAllDay: false });
    const txns = await run((s) => s.tx.select().from(transactions));
    expect(txns).toHaveLength(1);
    expect(txns[0].amountCents).toBe(-1250);
    expect(await run((s) => s.tx.select().from(workShifts))).toHaveLength(1);

    // Ticking a to-do offline sets the state the user saw, so repeating it changes nothing.
    const done = offlineOpSchema.parse({ kind: "task.status", id: randomUUID(), data: { taskId: task.id, done: true } });
    await run((s) => replayOp(s, TZ, done));
    await run((s) => replayOp(s, TZ, done));
    const [after] = await run((s) => s.tx.select().from(tasks));
    expect(after.status).toBe("done");
  });

  it("refuses changes that point at someone else's records", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const acct = await a.run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 0 }));
    const op = offlineOpSchema.parse({
      kind: "transaction.create",
      id: randomUUID(),
      data: { accountId: acct.id, amountCents: 500, description: "Sneaky", date: "2026-10-28" },
    });
    await expect(b.run((s) => replayOp(s, TZ, op))).rejects.toThrow(/not found/i);
    expect(offlineOpSchema.safeParse({ kind: "task.create", id: "not-a-uuid", data: { title: "x" } }).success).toBe(false);
  });
});
