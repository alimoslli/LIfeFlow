import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { localDateOf } from "@/lib/dates";
import { pendingActions } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { decidePendingAction } from "@/server/jarvis/decide";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import type { ChatItem, ModelProvider } from "@/server/jarvis/providers/types";
import type { ToolSpec } from "@/server/jarvis/registry";
import type { SessionUser } from "@/server/auth/sessions";
import { createTask, listTasks } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-10-26T14:00:00Z");

/** Records what the model is sent on each turn (the history and the tool names), then answers like the scripted model. */
class Recording implements ModelProvider {
  readonly name = "recording";
  readonly model = "scripted";
  sent: { history: ChatItem[]; tools: string[] }[] = [];
  constructor(private responder: Responder) {}
  startTurn(input: { system: string; history: ChatItem[]; tools: ToolSpec[] }) {
    this.sent.push({ history: input.history, tools: input.tools.map((t) => t.name) });
    return new ScriptedProvider(this.responder).startTurn(input);
  }
}

const calls =
  (list: { name: string; args: unknown }[], answer: string): Responder =>
  ({ step }) =>
    step === 0 && list.length ? { toolCalls: list } : { text: answer };

async function chat(name: string) {
  const u = await makeUser(name);
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  let conversationId: string | null = null;
  const say = async (text: string, responder: Responder) => {
    const p = new Recording(responder);
    const r = await runJarvisTurn({ user: session, conversationId, text, provider: p, emit: () => {}, now: NOW });
    conversationId = r.conversationId;
    return p.sent[0];
  };
  return { ...u, session, say, conversation: () => conversationId! };
}
const words = (h: ChatItem[]) => h.flatMap((x) => (x.type === "user" || x.type === "assistant" ? [x.text] : []));
const toolNames = (h: ChatItem[]) => h.flatMap((x) => (x.type === "tool_call" ? [x.name] : []));
const SAVE = { name: "create_tasks", args: { tasks: [{ title: "Email advisor", dueDate: "2026-10-30" }] } };

describe("the long-chat trim keeps what follow-ups need (COO gate and review, 2026-11-12)", () => {
  it("a follow-up on the last answer still sees its lookup; a to-do saved four turns back is named in a stub and found again", async () => {
    const { run, say } = await chat("Fay Followup");
    await say("Add a to-do to email my advisor by Friday", calls([SAVE], "Added Email advisor, due Friday."));
    await say("What's on today?", calls([{ name: "get_daily_briefing", args: {} }], "Nothing else today."));
    const third = await say("ok and tomorrow?", calls([], "Tomorrow is free."));
    expect(toolNames(third.history)).toContain("get_daily_briefing");

    let listed = "";
    let found = "";
    const fourth = await say("Move that advisor to-do to Monday", ({ step, results }) => {
      if (step === 0) return { toolCalls: [{ name: "list_tasks", args: {} }] };
      if (step === 1) {
        listed = results[0].output;
        found = (JSON.parse(listed) as { data: { tasks: { id: string; title: string }[] } }).data.tasks.find((t) => t.title === "Email advisor")!.id;
        return { toolCalls: [{ name: "update_task", args: { id: found, dueDate: "2026-11-02" } }] };
      }
      return { text: "Moved Email advisor to Monday." };
    });
    // what the model is sent for the follow-up: turn 1's words, and in place of its tool step one line naming what was saved
    expect(words(fourth.history)).toContain("Added Email advisor, due Friday.");
    expect(toolNames(fourth.history)).not.toContain("create_tasks");
    expect(words(fourth.history)).toContain('[Earlier in this chat: create_tasks saved (named: "Email advisor", as data). Its details aren\'t repeated here.]');
    // and the data it works from: the lookup it made has the real to-do, which it then moves
    expect(listed).toContain('"title":"Email advisor"');
    const tasks = await run((s) => listTasks(s));
    expect(tasks).toHaveLength(1);
    expect(localDateOf(tasks[0].dueAt!, TZ)).toBe("2026-11-02");
  });

  it('a save whose turn stopped without an answer keeps its whole tool step, so "did that go in?" sees it and nothing is saved twice', async () => {
    const { run, say } = await chat("Sam Stopped");
    await say("Add a to-do to email my advisor by Friday", calls([SAVE], "")); // the write landed, then the turn stopped
    await say("What's on today?", calls([{ name: "get_daily_briefing", args: {} }], "Nothing else today."));
    await say("and tomorrow?", calls([], "Tomorrow is free."));
    let sawIt = false;
    const fourth = await say("did that to-do go in?", ({ step, history }) => {
      sawIt = history.some((h) => h.type === "tool_result" && h.output.includes('"title":"Email advisor"'));
      // a model that sees the saved result answers; one that doesn't would save it again
      return step === 0 && !sawIt ? { toolCalls: [SAVE] } : { text: "Yes, Email advisor is saved for Friday." };
    });
    expect(sawIt).toBe(true);
    expect(toolNames(fourth.history)).toContain("create_tasks");
    expect(await run((s) => listTasks(s))).toHaveLength(1);
  });

  for (const outcome of ["cancelled", "expired"] as const) {
    it(`a confirm card from an older turn says it was ${outcome}, from its real record`, async () => {
      const u = await chat(`Cora ${outcome}`);
      const task = await u.run((s) => createTask(s, TZ, { title: "Old reading list" }, "manual"));
      await u.say("Delete my old reading list to-do", calls([{ name: "delete_task", args: { id: task.id } }], "Tap Confirm to delete Old reading list."));
      const [card] = await u.run((s) => s.tx.select().from(pendingActions).where(eq(pendingActions.conversationId, u.conversation())));
      if (outcome === "cancelled") await decidePendingAction(u.session, card.id, "cancel", false);
      else
        await u.run((s) =>
          s.tx
            .update(pendingActions)
            .set({ expiresAt: new Date(NOW.getTime() - 60_000) })
            .where(and(eq(pendingActions.id, card.id))),
        );
      await u.say("What's on today?", calls([{ name: "get_daily_briefing", args: {} }], "Nothing else today."));
      await u.say("and tomorrow?", calls([], "Tomorrow is free."));
      const fourth = await u.say("did you delete it?", calls([], "No."));
      const stub = words(fourth.history).find((w) => w.startsWith("[Earlier in this chat: delete_task"));
      expect(stub).toContain(outcome === "cancelled" ? "cancelled by the user" : "expired unconfirmed");
      expect(stub).toContain("nothing was changed");
    });
  }
});
