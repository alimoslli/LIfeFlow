import { afterAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { jarvisRuns, messages } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn, TOOK_TOO_LONG, type JarvisEvent } from "@/server/jarvis/agent";
import { snapshotForSend } from "@/server/jarvis/conversation-ui";
import { listMessages } from "@/server/jarvis/conversations";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import { requestStop, stopRequested } from "@/server/jarvis/stop";
import { turnStateOf } from "@/server/jarvis/turn-state";
import { listTasks } from "@/server/services/tasks";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

async function person(name: string) {
  const u = await makeUser(name);
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  return session;
}
const runsOf = (userId: string, conversationId: string) =>
  withUser(userId, (s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.conversationId, conversationId)).orderBy(desc(jarvisRuns.createdAt)));
const addTask: Responder = ({ step }) =>
  step === 0 ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "Pack lunch" }] } }] } : { text: "Added Pack lunch to your to-dos." };
const send = (user: SessionUser, text: string, clientMessageId: string, responder: Responder, extra: { conversationId?: string } = {}) => {
  const events: JarvisEvent[] = [];
  const done = runJarvisTurn({ user, text, clientMessageId, provider: new ScriptedProvider(responder), emit: (e) => events.push(e), ...extra });
  return done.then((r) => ({ ...r, events }));
};

describe("a turn survives a dropped connection", () => {
  it("keeps running, saves the answer and finishes its run when nobody is listening any more", async () => {
    const me = await person("Dana Drop");
    const id = crypto.randomUUID();
    let delivered = 0;
    const emit = () => {
      // The phone locked after the first event: every later write fails, like an enqueue on a closed stream.
      if (++delivered > 1) throw new TypeError("Invalid state: Controller is already closed");
    };
    const { conversationId } = await runJarvisTurn({ user: me, text: "add a task", clientMessageId: id, provider: new ScriptedProvider(addTask), emit });
    const snap = await withUser(me.id, (s) => snapshotForSend(s, id));
    expect(snap.state).toBe("finished");
    const last = snap.messages.at(-1)!;
    expect(last.role === "assistant" && last.text).toBe("Added Pack lunch to your to-dos.");
    expect(last.role === "assistant" && last.error).toBeUndefined();
    expect((await runsOf(me.id, conversationId))[0].outcome).toBe("ok");
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(1);
  });
});

describe("the same send never runs twice", () => {
  it("a retry of a finished send gets the saved answer: one task, one answer, one run", async () => {
    const me = await person("Rae Retry");
    const id = crypto.randomUUID();
    const first = await send(me, "add pay rent", id, addTask);
    const again = await send(me, "add pay rent", id, addTask);
    expect(again.conversationId).toBe(first.conversationId);
    expect(again.events.map((e) => e.type)).toEqual(["conversation", "already"]);
    expect(again.events.at(-1)).toMatchObject({ state: "finished" });
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(1);
    const rows = await withUser(me.id, (s) => listMessages(s, first.conversationId));
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
    expect(rows.filter((r) => r.role === "assistant")).toHaveLength(1);
    expect(await runsOf(me.id, first.conversationId)).toHaveLength(1);
  });

  it("two copies arriving together start one turn; the other is told it is already running", async () => {
    const me = await person("Race Twice");
    const id = crypto.randomUUID();
    const [a, b] = await Promise.all([send(me, "add a task", id, addTask), send(me, "add a task", id, addTask)]);
    const kinds = [a, b].map((r) => r.events.some((e) => e.type === "already"));
    expect(kinds.filter(Boolean)).toHaveLength(1);
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(1);
    const rows = await withUser(me.id, (s) => s.tx.select().from(messages).where(eq(messages.userId, me.id)));
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
  });

  it("a send whose turn died without an answer is continued once, without saving the message again", async () => {
    const me = await person("Dead Turn");
    const id = crypto.randomUUID();
    const first = await send(me, "add a task", id, addTask);
    // Make it look like the turn was killed: remove its run and age the message.
    await withUser(me.id, async (s) => {
      await s.tx.delete(jarvisRuns).where(eq(jarvisRuns.conversationId, first.conversationId));
      await s.tx
        .update(messages)
        .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
        .where(eq(messages.conversationId, first.conversationId));
    });
    expect((await withUser(me.id, (s) => turnStateOf(s, id))).state).toBe("stalled");
    await send(me, "add a task", id, ({ step }) => (step === 0 ? { text: "Here is the answer." } : { text: "" }));
    const rows = await withUser(me.id, (s) => listMessages(s, first.conversationId));
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
    expect((await withUser(me.id, (s) => turnStateOf(s, id))).state).toBe("finished");
  });

  it("someone else's send id is unknown to you", async () => {
    const owner = await person("Own Er");
    const other = await person("Not Owner");
    const id = crypto.randomUUID();
    await send(owner, "hi", id, () => ({ text: "Hello." }));
    const snap = await withUser(other.id, (s) => snapshotForSend(s, id));
    expect(snap).toMatchObject({ state: "unknown", conversationId: null, messages: [] });
  });
});

describe("Stop", () => {
  it("a Stop that arrives before the turn even starts still stops it: nothing is changed, no error is saved, the run is cancelled", async () => {
    const me = await person("Skye Early");
    const id = crypto.randomUUID();
    await requestStop(me.id, id); // the chat does not exist yet
    const { conversationId, events } = await send(me, "add a task", id, addTask);
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(0);
    expect(events.some((e) => e.type === "error" || e.type === "tool_start")).toBe(false);
    const [row] = await runsOf(me.id, conversationId);
    expect(row.outcome).toBe("cancelled");
    expect(row.errorKind).toBe("cancelled");
    const rows = await withUser(me.id, (s) => listMessages(s, conversationId));
    expect(rows.some((r) => r.status === "error")).toBe(false);
  });

  it("a late Stop for one send never stops the next one, and another user's Stop for the same id does nothing", async () => {
    const me = await person("Late Stop");
    const other = await person("Other Stopper");
    const first = await send(me, "hi", crypto.randomUUID(), () => ({ text: "Hello." }));
    const staleId = crypto.randomUUID();
    await requestStop(me.id, staleId); // arrives late, for a send that is over
    const nextId = crypto.randomUUID();
    await requestStop(other.id, nextId);
    expect(await stopRequested(me.id, nextId)).toBe(false);
    const next = await send(me, "add a task", nextId, addTask, { conversationId: first.conversationId });
    expect((await runsOf(me.id, next.conversationId))[0].outcome).toBe("ok");
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(1);
  });
});

describe("a turn that runs out of time", () => {
  it("is closed with a calm saved line and a run recorded as a timeout", async () => {
    const me = await person("Slow Poke");
    const real = Date.now;
    const spy = vi.spyOn(Date, "now");
    try {
      const { conversationId, events } = await send(me, "add a task", crypto.randomUUID(), ({ step }) => {
        if (step === 0) spy.mockImplementation(() => real() + 400_000); // the first step took "forever"
        return addTask({ history: [], step, results: [] });
      });
      expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(0);
      expect(events.some((e) => e.type === "error" && e.message === TOOK_TOO_LONG)).toBe(true);
      const [row] = await runsOf(me.id, conversationId);
      expect(row.errorKind).toBe("timeout");
      const rows = await withUser(me.id, (s) => listMessages(s, conversationId));
      expect(rows.at(-1)).toMatchObject({ role: "assistant", status: "error", content: TOOK_TOO_LONG });
    } finally {
      spy.mockRestore();
    }
  });
});
