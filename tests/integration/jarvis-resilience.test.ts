import { afterAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { jarvisRuns, messages } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { conversationSnapshot } from "@/server/jarvis/conversation-ui";
import { listMessages } from "@/server/jarvis/conversations";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import { requestStop, stopRequested } from "@/server/jarvis/stop";
import { listTasks } from "@/server/services/tasks";
import type { ModelProvider } from "@/server/jarvis/providers/types";
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

describe("a turn survives a dropped connection", () => {
  it("keeps running, saves the answer and finishes its run when nobody is listening any more", async () => {
    const me = await person("Dana Drop");
    let delivered = 0;
    const emit = (e: JarvisEvent) => {
      // The phone locked after the first event: every later write fails, like an enqueue on a closed stream.
      if (++delivered > 1) throw new TypeError("Invalid state: Controller is already closed");
      void e;
    };
    const responder: Responder = ({ step }) =>
      step === 0 ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "Pack lunch" }] } }] } : { text: "Added Pack lunch to your to-dos." };
    const { conversationId } = await runJarvisTurn({ user: me, text: "add a task", provider: new ScriptedProvider(responder), emit });
    const snap = await withUser(me.id, (s) => conversationSnapshot(s, conversationId));
    expect(snap?.finished).toBe(true);
    const last = snap!.messages.at(-1)!;
    expect(last.role === "assistant" && last.text).toBe("Added Pack lunch to your to-dos.");
    expect(last.role === "assistant" && last.error).toBeUndefined();
    const [run] = await runsOf(me.id, conversationId);
    expect(run.outcome).toBe("ok");
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(1);
  });

  it("does not save the same message twice when it is re-asked after the first try was saved but never answered", async () => {
    const me = await person("Rae Retry");
    const first = await runJarvisTurn({ user: me, text: "hello there", provider: new ScriptedProvider(() => ({ text: "Hi." })), emit: () => {} });
    // (The first try's answer is lost in this scenario; the user message is saved either way.)
    await runJarvisTurn({
      user: me,
      text: "hello there",
      conversationId: first.conversationId,
      resend: true,
      provider: new ScriptedProvider(() => ({ text: "Hi again." })),
      emit: () => {},
    });
    const rows = await withUser(me.id, (s) => listMessages(s, first.conversationId));
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
    // A chat id picked by the app is reused, not duplicated, when the same send arrives twice.
    const id = crypto.randomUUID();
    const a = await runJarvisTurn({ user: me, text: "one", newConversationId: id, provider: new ScriptedProvider(() => ({ text: "A" })), emit: () => {} });
    const b = await runJarvisTurn({
      user: me,
      text: "one",
      newConversationId: id,
      resend: true,
      provider: new ScriptedProvider(() => ({ text: "B" })),
      emit: () => {},
    });
    expect([a.conversationId, b.conversationId]).toEqual([id, id]);
    const rows2 = await withUser(me.id, (s) => s.tx.select().from(messages).where(eq(messages.conversationId, id)));
    expect(rows2.filter((r) => r.role === "user")).toHaveLength(1);
  });
});

describe("Stop", () => {
  const tool: Responder = ({ step }) =>
    step === 0 ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "Only once" }] } }] } : { text: "Second step answer." };

  it("Stop stops the turn before its tool runs: nothing is changed, no error is saved, the run is recorded as cancelled", async () => {
    const me = await person("Skye Early");
    let convId = "";
    const provider: ModelProvider = {
      name: "gate",
      model: "gate",
      startTurn(input) {
        const inner = new ScriptedProvider(tool).startTurn(input);
        return {
          async *step(results, next) {
            await requestStop(me.id, convId); // the user pressed Stop while this step was being answered
            yield* inner.step(results, next);
          },
        };
      },
    };
    const events: JarvisEvent[] = [];
    const { conversationId } = await runJarvisTurn({
      user: me,
      text: "add a task",
      provider,
      emit: (e) => {
        events.push(e);
        if (e.type === "conversation") convId = e.id;
      },
    });
    expect(await withUser(me.id, (s) => listTasks(s))).toHaveLength(0);
    expect(events.some((e) => e.type === "error" || e.type === "tool_start")).toBe(false);
    const [row] = await runsOf(me.id, conversationId);
    expect(row.outcome).toBe("cancelled");
    expect(row.errorKind).toBe("cancelled");
    const rows = await withUser(me.id, (s) => listMessages(s, conversationId));
    expect(rows.some((r) => r.status === "error")).toBe(false);
  });

  it("another user cannot stop someone else's turn, and a stop from before a turn does not affect a later one", async () => {
    const owner = await person("Own Er");
    const other = await person("Not Owner");
    const first = await runJarvisTurn({ user: owner, text: "hi", provider: new ScriptedProvider(() => ({ text: "Hello." })), emit: () => {} });
    await expect(requestStop(other.id, first.conversationId)).rejects.toThrow(/not found/i);
    expect(await withUser(other.id, (s) => conversationSnapshot(s, first.conversationId))).toBeNull();
    expect(await stopRequested(owner.id, first.conversationId, new Date(0))).toBe(false);
    // The owner's own old Stop does not stop the next message in the same chat.
    await requestStop(owner.id, first.conversationId);
    await new Promise((r) => setTimeout(r, 20));
    const next = await runJarvisTurn({
      user: owner,
      text: "again",
      conversationId: first.conversationId,
      provider: new ScriptedProvider(() => ({ text: "Still here." })),
      emit: () => {},
    });
    const [row] = await runsOf(owner.id, next.conversationId);
    expect(row.outcome).toBe("ok");
  });
});
