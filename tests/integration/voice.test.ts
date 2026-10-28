import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { closeDb } from "@/server/db/client";
import { jarvisRuns } from "@/server/db/schema";
import { listMessages } from "@/server/jarvis/conversations";
import { buildVoiceSession, recordVoiceRun, relayVoiceTool, saveVoiceTranscript, startVoiceSession } from "@/server/jarvis/voice";
import { listTasks } from "@/server/services/tasks";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

async function voiceUser(prefs?: SessionUser["preferences"]) {
  const u = await makeUser("Voice Person");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard", preferences: prefs };
  return { ...u, session };
}

function fakeOpenAI() {
  const calls: unknown[] = [];
  const client = {
    realtime: { clientSecrets: { create: async (p: unknown) => (calls.push(p), { value: "ek_test_123", expires_at: 1_900_000_000, session: {} }) } },
  };
  return { client: client as unknown as OpenAI, calls };
}

describe("live voice", () => {
  it("session config carries the user's assistant, voice, spoken-style rules and the same tools as chat", async () => {
    const { session } = await voiceUser({ assistantName: "Nova", assistantVoice: "cedar", assistantStyle: "warm" });
    const v = await buildVoiceSession(session, "home");
    expect(v.voice).toBe("cedar");
    expect(v.instructions).toContain("Your name is Nova.");
    expect(v.instructions).toMatch(/live voice conversation/);
    expect(v.tools.length).toBeGreaterThan(40);
    expect(v.tools.every((t) => t.type === "function" && t.name && t.parameters)).toBe(true);
  });

  it("returns only a short-lived client secret (never the API key) and opens a conversation", async () => {
    const { session, run } = await voiceUser();
    const { client, calls } = fakeOpenAI();
    process.env.OPENAI_API_KEY ||= "sk-test";
    const r = await startVoiceSession(session, "home", client);
    expect(r.clientSecret).toBe("ek_test_123");
    expect(JSON.stringify(r)).not.toContain(process.env.OPENAI_API_KEY);
    const sent = calls[0] as { expires_after: { seconds: number }; session: { type: string; audio: { output: { voice: string } } } };
    expect(sent.expires_after.seconds).toBeLessThanOrEqual(600);
    expect(sent.session).toMatchObject({ type: "realtime", audio: { output: { voice: "marin" } } });
    expect(await run((s) => listMessages(s, r.conversationId))).toEqual([]);
  });

  it("relays tool calls through the normal executor and saves transcript + call record", async () => {
    const { session, run } = await voiceUser();
    const { client } = fakeOpenAI();
    const { conversationId } = await startVoiceSession(session, "home", client);
    await saveVoiceTranscript(session, conversationId, "user", "Add a task to buy stamps");
    const r = await relayVoiceTool(session, {
      conversationId,
      callId: "c1",
      name: "create_tasks",
      arguments: JSON.stringify({ tasks: [{ title: "Buy stamps" }] }),
    });
    expect(r).toMatchObject({ ok: true, summary: "Created 1 task" });
    expect((await run((s) => listTasks(s, { status: "open" }))).map((t) => t.title)).toEqual(["Buy stamps"]);
    await saveVoiceTranscript(session, conversationId, "assistant", "Done, I added it.");
    expect((await run((s) => listMessages(s, conversationId))).map((m) => m.role)).toEqual(["user", "tool", "assistant"]);

    // Deletions still wait for an explicit Confirm.
    const [task] = await run((s) => listTasks(s, { status: "open" }));
    const del = await relayVoiceTool(session, { conversationId, callId: "c2", name: "delete_task", arguments: JSON.stringify({ id: task.id }) });
    expect(del.confirmation?.summary).toMatch(/Buy stamps/);
    expect(await run((s) => listTasks(s, { status: "open" }))).toHaveLength(1);

    const runId = await recordVoiceRun(session, conversationId, {
      durationMs: 42_000,
      responses: 3,
      toolCalls: 2,
      toolErrors: 0,
      confirmations: 1,
      inputTokens: 900,
      outputTokens: 120,
    });
    const [row] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.id, runId)));
    expect(row).toMatchObject({ provider: "openai-realtime", outcome: "ok", toolCalls: 2, confirmations: 1, inputTokens: 900, costMicros: null });
  });

  it("can't use another user's conversation", async () => {
    const a = await voiceUser();
    const b = await voiceUser();
    const { conversationId } = await startVoiceSession(a.session, "home", fakeOpenAI().client);
    await expect(relayVoiceTool(b.session, { conversationId, callId: "x", name: "list_tasks", arguments: "{}" })).rejects.toThrow(/not found/i);
    await expect(saveVoiceTranscript(b.session, conversationId, "user", "hi")).rejects.toThrow(/not found/i);
  });
});
