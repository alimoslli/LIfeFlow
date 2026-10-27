import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { runJarvisTurn, makeToolContext, type JarvisEvent } from "@/server/jarvis/agent";
import { listMessages, loadHistory } from "@/server/jarvis/conversations";
import { executeToolCall, resolvePendingAction } from "@/server/jarvis/executor";
import { ScriptedProvider, type Responder } from "@/server/jarvis/providers/scripted";
import type { ModelProvider } from "@/server/jarvis/providers/types";
import { toolSpecs } from "@/server/jarvis/registry";
import { createCourse, listAssignments } from "@/server/services/school";
import { createTask, getTask, listTasks } from "@/server/services/tasks";
import { listActiveMemories } from "@/server/services/memory";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-10-26T14:00:00Z");

async function jarvisUser() {
  const u = await makeUser("Sam Rivera");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  return { ...u, session };
}

async function turn(session: SessionUser, text: string, responder: Responder, conversationId?: string) {
  const events: JarvisEvent[] = [];
  const res = await runJarvisTurn({ user: session, text, conversationId, provider: new ScriptedProvider(responder), emit: (e) => events.push(e), now: NOW });
  return { ...res, events, text: events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("") };
}

/** A responder that calls the given tools on step 0, then echoes results. */
const callThenSummarize =
  (calls: { name: string; args: unknown }[]): Responder =>
  ({ step, results }) =>
    step === 0 ? { toolCalls: calls } : { text: results.map((r) => r.output).join("\n") };

describe("Jarvis tool loop", () => {
  it("every tool has a valid JSON schema", () => {
    const specs = toolSpecs();
    expect(specs.length).toBeGreaterThan(40);
    for (const s of specs) expect(s.parameters.type).toBe("object");
  });

  it("saves assignments from chat into the School module and verifies them", async () => {
    const { session, run } = await jarvisUser();
    await run((s) => createCourse(s, { name: "Introduction to Psychology", code: "PSY 101" }));
    const r = await turn(
      session,
      "PSY 101: Chapter 4 quiz due Friday 11:59pm, and the research paper due Nov 14",
      callThenSummarize([
        {
          name: "import_assignments",
          args: {
            items: [
              { title: "Chapter 4 Quiz", courseName: "PSY 101", kind: "quiz", dueDate: "2026-10-30", dueTime: "23:59" },
              { title: "Research Paper", courseName: "PSY 101", dueDate: "2026-11-14" },
            ],
          },
        },
      ]),
    );
    const toolEnd = r.events.find((e) => e.type === "tool_end") as Extract<JarvisEvent, { type: "tool_end" }>;
    expect(toolEnd).toMatchObject({ ok: true, summary: "Saved 2 assignments", viewAt: "/school" });
    expect(r.text).toContain('"verifiedInDatabase":2');

    // The records exist in the School module, attributed to Jarvis.
    const saved = await run((s) => listAssignments(s, TZ, { now: NOW }));
    expect(saved.map((a) => [a.title, a.course.code, a.source])).toEqual([
      ["Chapter 4 Quiz", "PSY 101", "jarvis"],
      ["Research Paper", "PSY 101", "jarvis"],
    ]);

    // A later turn in the same conversation replays the tool exchange.
    const history = await run((s) => loadHistory(s, r.conversationId));
    expect(history.map((h) => h.type)).toEqual(["user", "tool_call", "tool_result", "assistant"]);
  });

  it("creates a task that can be retrieved in a later conversation", async () => {
    const { session, run } = await jarvisUser();
    await turn(session, "remind me to email my advisor tomorrow", callThenSummarize([{ name: "create_tasks", args: { tasks: [{ title: "Email advisor", dueDate: "2026-10-27", priority: "high", subtasks: ["Draft questions"] }] } }]));
    const r2 = await turn(session, "what's on my list?", callThenSummarize([{ name: "list_tasks", args: {} }]));
    expect(r2.text).toContain("Email advisor");
    expect(r2.text).toContain("Draft questions");
    const tasks = await run((s) => listTasks(s));
    expect(tasks.find((t) => t.title === "Email advisor")).toMatchObject({ priority: "high", source: "jarvis" });
  });

  it("requires explicit confirmation before deleting, and the model cannot bypass it", async () => {
    const { session, run } = await jarvisUser();
    const task = await run((s) => createTask(s, TZ, { title: "Old task" }));
    const r = await turn(session, "delete old task", callThenSummarize([{ name: "delete_task", args: { id: task.id } }]));
    const confirmation = r.events.find((e) => e.type === "confirmation") as Extract<JarvisEvent, { type: "confirmation" }>;
    expect(confirmation.summary).toBe('Delete task "Old task"?');
    expect(r.text).toContain("awaiting_user_confirmation");
    expect((await run((s) => getTask(s, task.id))).title).toBe("Old task"); // still there

    const ctx = makeToolContext(session, r.conversationId);
    const resolved = await resolvePendingAction(confirmation.actionId, "confirm", ctx);
    expect(resolved.status).toBe("executed");
    await expect(run((s) => getTask(s, task.id))).rejects.toThrow(/not found/);
    await expect(resolvePendingAction(confirmation.actionId, "confirm", ctx)).rejects.toThrow(/already executed/);
  });

  it("cannot act on another user's records even with a valid id", async () => {
    const alice = await jarvisUser();
    const mallory = await jarvisUser();
    const task = await alice.run((s) => createTask(s, TZ, { title: "Alice's secret" }));
    const r = await turn(mallory.session, "x", callThenSummarize([
      { name: "get_task", args: { id: task.id } },
      { name: "update_task", args: { id: task.id, title: "pwned" } },
    ]));
    const ends = r.events.filter((e) => e.type === "tool_end") as Extract<JarvisEvent, { type: "tool_end" }>[];
    expect(ends.map((e) => [e.ok, e.summary])).toEqual([
      [false, "Task not found"],
      [false, "Task not found"],
    ]);
    expect((await alice.run((s) => getTask(s, task.id))).title).toBe("Alice's secret");
  });

  it("rejects invalid arguments and unknown tools without crashing", async () => {
    const { session } = await jarvisUser();
    const ctx = makeToolContext(session, "00000000-0000-0000-0000-000000000000");
    const bad = await executeToolCall("create_tasks", JSON.stringify({ tasks: [{ title: "" }] }), ctx, "c1");
    expect(bad.result).toMatchObject({ ok: false });
    expect(bad.result.error).toMatch(/Invalid arguments/);
    expect((await executeToolCall("drop_database", "{}", ctx, "c2")).result).toEqual({ ok: false, error: 'Unknown tool "drop_database"' });
    expect((await executeToolCall("list_tasks", "{not json", ctx, "c3")).result.ok).toBe(false);
  });

  it("refuses to store secrets in memory but saves real preferences", async () => {
    const { session, run } = await jarvisUser();
    const r = await turn(session, "remember", callThenSummarize([
      { name: "save_memory", args: { content: "Prefers studying in the morning.", category: "preference" } },
      { name: "save_memory", args: { content: "Bank password: hunter2hunter2", category: "fact" } },
    ]));
    const ends = r.events.filter((e) => e.type === "tool_end") as Extract<JarvisEvent, { type: "tool_end" }>[];
    expect(ends[0].ok).toBe(true);
    expect(ends[1].ok).toBe(false);
    const mems = await run((s) => listActiveMemories(s));
    expect(mems.map((m) => m.content)).toEqual(["Prefers studying in the morning."]);
  });

  it("puts only relevant approved memories into the prompt, after a cacheable static prefix", async () => {
    const { session, run } = await jarvisUser();
    await turn(session, "remember", callThenSummarize([{ name: "save_memory", args: { content: "Works at the campus library on Thursday evenings.", category: "routine" } }]));
    await turn(session, "fyi", callThenSummarize([{ name: "save_memory", args: { content: "Is learning Spanish.", category: "goal" } }])); // only a suggestion
    const seen: string[] = [];
    const spy: ModelProvider = {
      name: "spy",
      model: "spy",
      startTurn(input) {
        seen.push(input.system);
        return new ScriptedProvider(() => ({ text: "ok" })).startTurn(input);
      },
    };
    const relevant = await runJarvisTurn({ user: session, text: "When do I work this week?", provider: spy, emit: () => {}, now: NOW });
    await runJarvisTurn({ user: session, text: "hi", provider: spy, emit: () => {}, now: NOW });
    expect(seen[0]).toContain("Works at the campus library on Thursday evenings.");
    expect(seen[0]).toContain("Today is 2026-10-26");
    expect(seen[1]).not.toContain("campus library");
    expect(seen[1]).toContain("1 other saved memory wasn't relevant");
    for (const sys of seen) expect(sys).not.toContain("Spanish"); // unapproved suggestions never reach the model

    // The instructions before "# Right now" are identical for every user and time.
    const other = await jarvisUser();
    await runJarvisTurn({ user: other.session, text: "hi", provider: spy, emit: () => {}, now: new Date("2027-01-01T00:00:00Z") });
    const prefix = (x: string) => x.slice(0, x.indexOf("# Right now"));
    expect(prefix(seen[2])).toBe(prefix(seen[0]));
    expect(prefix(seen[0]).length).toBeGreaterThan(2000);

    // The run records which memories were used.
    const { jarvisRuns } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, relevant.runId!)));
    expect(row.memoryIds).toHaveLength(1);
  });

  it("reports provider failures honestly and persists them", async () => {
    const { session, run } = await jarvisUser();
    const failing: ModelProvider = {
      name: "failing",
      model: "failing",
      startTurn: () => ({
        async *step() {
          throw Object.assign(new Error("Unauthorized"), { status: 401 });
        },
      }),
    };
    const events: JarvisEvent[] = [];
    const { conversationId } = await runJarvisTurn({ user: session, text: "hello", provider: failing, emit: (e) => events.push(e), now: NOW });
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: expect.stringMatching(/OPENAI_API_KEY/) });
    const msgs = await run((s) => listMessages(s, conversationId));
    expect(msgs.map((m) => [m.role, m.status])).toEqual([
      ["user", "complete"],
      ["assistant", "error"],
    ]);
  });
});
