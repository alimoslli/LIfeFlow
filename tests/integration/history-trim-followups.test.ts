import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { localDateOf } from "@/lib/dates";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import type { ChatItem, ModelProvider } from "@/server/jarvis/providers/types";
import type { ToolSpec } from "@/server/jarvis/registry";
import type { SessionUser } from "@/server/auth/sessions";
import { listTasks } from "@/server/services/tasks";
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

describe("the long-chat trim keeps what follow-ups need (COO gate, 2026-11-12)", () => {
  it("a follow-up on the last answer still sees its lookup; something saved four turns back is found again and changed", async () => {
    const u = await makeUser("Fay Followup");
    const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
    let conversationId: string | null = null;
    const say = async (text: string, responder: Responder) => {
      const p = new Recording(responder);
      const r = await runJarvisTurn({ user: session, conversationId, text, provider: p, emit: () => {}, now: NOW });
      conversationId = r.conversationId;
      return p.sent[0];
    };

    // 1. something saved
    await say(
      "Add a to-do to email my advisor by Friday",
      calls([{ name: "create_tasks", args: { tasks: [{ title: "Email advisor", dueDate: "2026-10-30" }] } }], "Added Email advisor, due Friday."),
    );
    // 2. a lookup
    await say("What's on today?", calls([{ name: "get_daily_briefing", args: {} }], "Nothing else today."));
    // 3. a follow-up on that lookup: its tool steps are still there
    const third = await say("ok and tomorrow?", calls([], "Tomorrow is free."));
    expect(third.history.filter((h) => h.type === "tool_call").map((h) => (h as { name: string }).name)).toContain("get_daily_briefing");
    expect(third.history.some((h) => h.type === "tool_result")).toBe(true);
    // 4. back to what was saved in turn 1: its words are still in the chat, its tool step isn't, and the tools to find and
    // change it are on the list, so the skyling looks it up again and moves it
    let found = "";
    const fourth = await say("Move that advisor to-do to Monday", ({ step, results }) => {
      if (step === 0) return { toolCalls: [{ name: "list_tasks", args: {} }] };
      if (step === 1) {
        found = (JSON.parse(results[0].output) as { data: { tasks: { id: string; title: string }[] } }).data.tasks.find((t) => t.title === "Email advisor")!.id;
        return { toolCalls: [{ name: "update_task", args: { id: found, dueDate: "2026-11-02" } }] };
      }
      return { text: "Moved Email advisor to Monday." };
    });
    const words = fourth.history.flatMap((h) => (h.type === "user" || h.type === "assistant" ? [h.text] : []));
    expect(words).toContain("Add a to-do to email my advisor by Friday");
    expect(words).toContain("Added Email advisor, due Friday.");
    expect(fourth.history.filter((h) => h.type === "tool_call").map((h) => (h as { name: string }).name)).not.toContain("create_tasks");
    expect(fourth.tools).toEqual(expect.arrayContaining(["list_tasks", "update_task"]));
    const tasks = await u.run((s) => listTasks(s));
    expect(tasks.find((t) => t.id === found)).toBeTruthy();
    expect(localDateOf(tasks.find((t) => t.id === found)!.dueAt!, TZ)).toBe("2026-11-02");
  });
});
