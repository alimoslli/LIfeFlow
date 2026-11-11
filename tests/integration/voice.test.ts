import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { closeDb } from "@/server/db/client";
import { jarvisRuns, voiceSessions } from "@/server/db/schema";
import { listMessages } from "@/server/jarvis/conversations";
import { buildVoiceSession, recordVoiceRun, relayVoiceTool, saveVoiceTranscript, startVoiceSession } from "@/server/jarvis/voice";
import { listTasks } from "@/server/services/tasks";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

async function voiceUser(prefs?: SessionUser["preferences"]) {
  const u = await makeUser("Voice Person");
  const session: SessionUser = {
    id: u.user.id,
    email: u.user.email,
    name: u.user.name,
    timezone: TZ,
    accountKind: "standard",
    preferences: { aiConsentAt: "2026-01-01T00:00:00.000Z", ...prefs },
  };
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

  it("continues the chat it was started from, knowing what was typed, and refuses someone else's chat", async () => {
    const { session } = await voiceUser();
    const { client, calls } = fakeOpenAI();
    process.env.OPENAI_API_KEY ||= "sk-test";
    const first = await startVoiceSession(session, "home", client);
    await saveVoiceTranscript(session, first.conversationId, "user", "I have a shift at Target on Friday");
    await saveVoiceTranscript(session, first.conversationId, "assistant", "Got it, Friday at Target.");
    const again = await startVoiceSession(session, "home", client, first.conversationId);
    expect(again.conversationId).toBe(first.conversationId);
    const instructions = (calls[1] as { session: { instructions: string } }).session.instructions;
    expect(instructions).toContain("# This conversation so far");
    expect(instructions).toContain("User: I have a shift at Target on Friday");
    expect(instructions).toContain("You: Got it, Friday at Target.");

    const other = await voiceUser();
    await expect(startVoiceSession(other.session, "home", client, first.conversationId)).rejects.toThrow(/not found/);
  });

  it("relays tool calls through the normal executor and saves transcript + call record", async () => {
    const { session, run } = await voiceUser();
    const { client } = fakeOpenAI();
    const { conversationId, voiceSessionId } = await startVoiceSession(session, "home", client);
    await saveVoiceTranscript(session, conversationId, "user", "Add a task to buy stamps");
    const r = await relayVoiceTool(session, {
      voiceSessionId,
      conversationId,
      callId: "c1",
      name: "create_tasks",
      arguments: JSON.stringify({ tasks: [{ title: "Buy stamps" }] }),
    });
    expect(r).toMatchObject({ ok: true, summary: "To-do added: Buy stamps" });
    expect((await run((s) => listTasks(s, { status: "open" }))).map((t) => t.title)).toEqual(["Buy stamps"]);
    await saveVoiceTranscript(session, conversationId, "assistant", "Done, I added it.");
    expect((await run((s) => listMessages(s, conversationId))).map((m) => m.role)).toEqual(["user", "tool", "assistant"]);

    // Deletions still wait for an explicit Confirm.
    const [task] = await run((s) => listTasks(s, { status: "open" }));
    const del = await relayVoiceTool(session, {
      voiceSessionId,
      conversationId,
      callId: "c2",
      name: "delete_task",
      arguments: JSON.stringify({ id: task.id }),
    });
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
    const { conversationId, voiceSessionId } = await startVoiceSession(a.session, "home", fakeOpenAI().client);
    await expect(relayVoiceTool(b.session, { voiceSessionId, conversationId, callId: "x", name: "list_tasks", arguments: "{}" })).rejects.toThrow(/not found/i);
    await expect(saveVoiceTranscript(b.session, conversationId, "user", "hi")).rejects.toThrow(/not found/i);
  });

  it("refuses a tool call without a live server-issued session of the same user and conversation", async () => {
    const a = await voiceUser();
    const b = await voiceUser();
    const { client } = fakeOpenAI();
    const call = await startVoiceSession(a.session, "home", client);
    const other = await startVoiceSession(a.session, "home", client);
    const args = JSON.stringify({ tasks: [{ title: "Nope" }] });
    const base = { conversationId: call.conversationId, callId: "g1", name: "create_tasks", arguments: args };
    await expect(relayVoiceTool(a.session, { ...base, voiceSessionId: randomUUID() })).rejects.toThrow(/isn't active/);
    // another user's session id, and a session of the same user for a different conversation
    await expect(relayVoiceTool(b.session, { ...base, voiceSessionId: call.voiceSessionId })).rejects.toThrow();
    await expect(relayVoiceTool(a.session, { ...base, voiceSessionId: other.voiceSessionId })).rejects.toThrow(/isn't active/);
    // expired
    await a.run((s) =>
      s.tx
        .update(voiceSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(voiceSessions.id, call.voiceSessionId)),
    );
    await expect(relayVoiceTool(a.session, { ...base, voiceSessionId: call.voiceSessionId })).rejects.toThrow(/isn't active/);
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(0);
  });

  it("applies the plan and AI consent checks to tool calls", async () => {
    const a = await voiceUser();
    const { client } = fakeOpenAI();
    const call = await startVoiceSession(a.session, "home", client);
    const input = { voiceSessionId: call.voiceSessionId, conversationId: call.conversationId, callId: "p1", name: "list_tasks", arguments: "{}" };
    await expect(relayVoiceTool({ ...a.session, preferences: {} }, input)).rejects.toThrow(/AI|allow/i);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("STRIPE_PRICE_ID", "price_1");
    vi.stubEnv("APP_URL", "https://lifeflow.test");
    try {
      await expect(relayVoiceTool({ ...a.session, plan: "free" }, input)).rejects.toThrow(/Pro/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a repeated call id returns the first result and never runs the tool twice", async () => {
    const a = await voiceUser();
    const { client } = fakeOpenAI();
    const call = await startVoiceSession(a.session, "home", client);
    const input = {
      voiceSessionId: call.voiceSessionId,
      conversationId: call.conversationId,
      callId: "dup",
      name: "create_tasks",
      arguments: JSON.stringify({ tasks: [{ title: "Once" }] }),
    };
    const [x, y] = await Promise.allSettled([relayVoiceTool(a.session, input), relayVoiceTool(a.session, input)]);
    const again = await relayVoiceTool(a.session, input);
    const ok = [x, y].filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(again).toEqual((ok[0] as PromiseFulfilledResult<unknown>).value);
    expect((await a.run((s) => listTasks(s, { status: "open" }))).map((t) => t.title)).toEqual(["Once"]);
    // the same id in another call is a different tool call
    const next = await startVoiceSession(a.session, "home", client);
    await relayVoiceTool(a.session, { ...input, voiceSessionId: next.voiceSessionId, conversationId: next.conversationId });
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(2);
  });
});
