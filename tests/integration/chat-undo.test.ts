import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { loadHistory } from "@/server/jarvis/conversations";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import { undoChatTools } from "@/server/jarvis/undo";
import type { SessionUser } from "@/server/auth/sessions";
import { getEvent } from "@/server/services/calendar";
import { deleteTask, getTask, listTasks } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-10-26T14:00:00Z");

async function chatUser(name = "Una Undo") {
  const u = await makeUser(name);
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  return { ...u, session };
}

async function turn(session: SessionUser, text: string, calls: { name: string; args: unknown }[]) {
  const events: JarvisEvent[] = [];
  const responder: Responder = ({ step, results }) =>
    step === 0
      ? { toolCalls: calls }
      : {
          text: results
            .map((r) => r.output)
            .join("\n")
            .slice(0, 200),
        };
  const res = await runJarvisTurn({ user: session, text, provider: new ScriptedProvider(responder), emit: (e) => events.push(e), now: NOW });
  const callIds = events.filter((e) => e.type === "tool_start").map((e) => (e as { callId: string }).callId);
  return { ...res, callIds };
}

const PLAN = [
  { name: "create_tasks", args: { tasks: [{ title: "Email advisor", dueDate: "2026-10-27", subtasks: ["Draft questions"] }] } },
  { name: "create_events", args: { events: [{ title: "BIO study", date: "2026-10-28", startTime: "13:00", endTime: "15:00" }] } },
];

describe("Undo in the chat takes back exactly what the last answer created (program item 8)", () => {
  it("removes the to-do, its subtask and the event, once, and the conversation knows", async () => {
    const { session, run } = await chatUser();
    await run((s) => import("@/server/services/tasks").then((m) => m.createTask(s, TZ, { title: "Something I made myself" })));
    const t = await turn(session, "plan my week", PLAN);
    expect(t.callIds).toHaveLength(2);
    const tasks = await run((s) => listTasks(s));
    expect(tasks.map((x) => x.title).sort()).toEqual(["Draft questions", "Email advisor", "Something I made myself"].sort());

    const r = await run((s) => undoChatTools(s, t.conversationId, t.callIds, NOW));
    expect(r).toMatchObject({ tasksRemoved: 1, eventsRemoved: 1, text: "Took that back: removed 1 to-do and 1 calendar event." });
    // only what the answer made is gone
    expect((await run((s) => listTasks(s))).map((x) => x.title)).toEqual(["Something I made myself"]);
    // the next answer sees the note
    const history = await run((s) => loadHistory(s, t.conversationId));
    expect(JSON.stringify(history.at(-1))).toContain("Took that back");
    // once only
    await expect(run((s) => undoChatTools(s, t.conversationId, t.callIds, NOW))).rejects.toThrow("That was already taken back.");
  });

  it("names the one thing it removed, and says so plainly when it was already gone", async () => {
    const { session, run } = await chatUser("Solo Item");
    const t = await turn(session, "add a to-do", [{ name: "create_tasks", args: { tasks: [{ title: "Pack lunch" }] } }]);
    expect((await run((s) => undoChatTools(s, t.conversationId, t.callIds, NOW))).text).toBe('Took that back: removed "Pack lunch".');

    const t2 = await turn(session, "add another", [{ name: "create_tasks", args: { tasks: [{ title: "Water plants" }] } }]);
    const made = (await run((s) => listTasks(s))).find((x) => x.title === "Water plants")!;
    await run((s) => deleteTask(s, made.id));
    expect((await run((s) => undoChatTools(s, t2.conversationId, t2.callIds, NOW))).text).toBe("Took that back. It was already gone, so nothing else changed.");
  });

  it("refuses someone else's conversation, reading tools, and anything older than a day", async () => {
    const { session, run } = await chatUser("Owner One");
    const t = await turn(session, "plan my week", PLAN);
    const other = await chatUser("Someone Else");
    await expect(other.run((s) => undoChatTools(s, t.conversationId, t.callIds, NOW))).rejects.toThrow(/not found/);
    const ids = await run((s) => listTasks(s));
    expect(ids.length).toBe(2);

    const read = await turn(session, "what's on my list?", [{ name: "list_tasks", args: {} }]);
    await expect(run((s) => undoChatTools(s, read.conversationId, read.callIds, NOW))).rejects.toThrow("There's nothing to undo here.");
    await expect(run((s) => undoChatTools(s, t.conversationId, [], NOW))).rejects.toThrow("There's nothing to undo here.");

    const later = new Date(Date.now() + 25 * 3600_000);
    await expect(run((s) => undoChatTools(s, t.conversationId, t.callIds, later))).rejects.toThrow(/too old/);
    // nothing was removed by the refusals
    expect(await run((s) => getTask(s, ids[0].id))).toBeTruthy();
    const ev = (await run((s) => s.tx.query.calendarEvents.findFirst())) as { id: string } | undefined;
    if (ev) expect(await run((s) => getEvent(s, ev.id))).toBeTruthy();
  });
});
