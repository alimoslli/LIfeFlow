import { and, eq } from "drizzle-orm";
import type OpenAI from "openai";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { users, voiceSessions, voiceToolCalls } from "@/server/db/schema";
import { recordRun } from "@/server/jarvis/metrics";
import { purgeExpiredVoiceSessions, relayVoiceTool, startVoiceSession } from "@/server/jarvis/voice";
import { listTasks } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

let current: SessionUser | null = null;
vi.mock("@/server/auth/current-user", async (orig) => ({
  ...(await orig<typeof import("@/server/auth/current-user")>()),
  getSessionUser: async () => current,
}));

afterAll(closeDb);

const fake = { realtime: { clientSecrets: { create: async () => ({ value: "ek", expires_at: 1_900_000_000, session: {} }) } } } as unknown as OpenAI;

async function person() {
  const u = await makeUser("Guard");
  const session: SessionUser = {
    id: u.user.id,
    email: u.user.email,
    name: u.user.name,
    timezone: TZ,
    accountKind: "standard",
    preferences: { aiConsentAt: "2026-01-01T00:00:00.000Z" },
  };
  return { ...u, session };
}
const args = (title: string) => JSON.stringify({ tasks: [{ title }] });

describe("voice tool guards", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY ||= "sk-test";
  });

  it("a concurrent identical call answers 409 while the first runs, and the first result afterwards", async () => {
    const a = await person();
    const call = await startVoiceSession(a.session, "home", fake);
    // Pretend the first run is still going: a claim with no result yet.
    await a.run((s) => s.tx.insert(voiceToolCalls).values({ sessionId: call.voiceSessionId, callId: "busy", userId: s.userId }));
    const input = { voiceSessionId: call.voiceSessionId, conversationId: call.conversationId, callId: "busy", name: "create_tasks", arguments: args("X") };
    await expect(relayVoiceTool(a.session, input)).rejects.toMatchObject({ status: 409 });
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(0);
  });

  it("a tool that throws removes the claim, and the retry runs once", async () => {
    const a = await person();
    const call = await startVoiceSession(a.session, "home", fake);
    const input = { voiceSessionId: call.voiceSessionId, conversationId: call.conversationId, callId: "t1", name: "create_tasks", arguments: args("Retry me") };
    const agent = await import("@/server/jarvis/agent");
    const spy = vi.spyOn(agent, "makeToolContext").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(relayVoiceTool(a.session, input)).rejects.toThrow("boom");
    spy.mockRestore();
    expect(await a.run((s) => s.tx.select().from(voiceToolCalls).where(eq(voiceToolCalls.callId, "t1")))).toHaveLength(0);
    await relayVoiceTool(a.session, input);
    await relayVoiceTool(a.session, input);
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(1);
  });

  it("when saving the result fails the claim stays: the tool ran once and a repeat is not run again", async () => {
    const a = await person();
    const call = await startVoiceSession(a.session, "home", fake);
    const input = { voiceSessionId: call.voiceSessionId, conversationId: call.conversationId, callId: "s1", name: "create_tasks", arguments: args("Once") };
    const db = getDb();
    await db.execute(
      `create or replace function lf_test_block_voice_update() returns trigger language plpgsql as $$ begin raise exception 'blocked'; end $$` as never,
    );
    await db.execute(
      `create trigger lf_test_block_voice before update on voice_tool_calls for each row execute function lf_test_block_voice_update()` as never,
    );
    try {
      const out = await relayVoiceTool(a.session, input);
      expect(out.ok).toBe(true);
      await expect(relayVoiceTool(a.session, input)).rejects.toMatchObject({ status: 409 });
    } finally {
      await db.execute(`drop trigger lf_test_block_voice on voice_tool_calls` as never);
    }
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(1);
  });

  it("refuses an expired session and another user's valid session id", async () => {
    const a = await person();
    const b = await person();
    const call = await startVoiceSession(a.session, "home", fake);
    const input = { voiceSessionId: call.voiceSessionId, conversationId: call.conversationId, callId: "e1", name: "create_tasks", arguments: args("No") };
    await expect(relayVoiceTool(b.session, input)).rejects.toBeTruthy();
    await a.run((s) =>
      s.tx
        .update(voiceSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(voiceSessions.id, call.voiceSessionId)),
    );
    await expect(relayVoiceTool(a.session, input)).rejects.toMatchObject({ status: 403 });
    expect(await a.run((s) => listTasks(s, { status: "open" }))).toHaveLength(0);
  });

  it("the daily purge removes ended calls and their saved results, keeps live ones", async () => {
    const a = await person();
    const old = await startVoiceSession(a.session, "home", fake);
    const live = await startVoiceSession(a.session, "home", fake);
    await a.run((s) => s.tx.insert(voiceToolCalls).values({ sessionId: old.voiceSessionId, callId: "x", userId: s.userId, result: { ok: true } }));
    await a.run((s) =>
      s.tx
        .update(voiceSessions)
        .set({ expiresAt: new Date(Date.now() - 2 * 3_600_000) })
        .where(eq(voiceSessions.id, old.voiceSessionId)),
    );
    await a.run((s) => purgeExpiredVoiceSessions(s));
    expect(await a.run((s) => s.tx.select().from(voiceSessions))).toMatchObject([{ id: live.voiceSessionId }]);
    expect(
      await a.run((s) =>
        s.tx
          .select()
          .from(voiceToolCalls)
          .where(and(eq(voiceToolCalls.callId, "x"))),
      ),
    ).toHaveLength(0);
  });
});

describe("voice session route: monthly dollar cap", () => {
  it("refuses a new call once this month's measured spend reaches the testing cap", async () => {
    const { POST } = await import("@/app/api/jarvis/voice/session/route");
    const a = await person();
    const conv = await startVoiceSession(a.session, "home", fake);
    current = a.session;
    const post = () => POST(new Request("https://lifeflow.test/api/jarvis/voice/session", { method: "POST", body: "{}" }));
    await a.run((s) =>
      recordRun(s, {
        conversationId: conv.conversationId,
        messageId: null,
        provider: "test",
        model: "m",
        promptVersion: "v",
        outcome: "ok",
        errorKind: null,
        latencyMs: 1,
        firstTokenMs: null,
        steps: 1,
        toolCalls: 0,
        toolErrors: 0,
        confirmations: 0,
        toolNames: [],
        usage: null,
        costMicros: 5_000_000,
        memoryIds: [],
      }),
    );
    const res = await post();
    expect(res.status).toBe(429);
    current = null;
  });
});

describe("notify cron", () => {
  it("skips suspended accounts", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const { GET } = await import("@/app/api/cron/notify/route");
    const runDue = await import("@/server/services/proactive/engine");
    const spy = vi.spyOn(runDue, "runDueSlot");
    const a = await person();
    const b = await person();
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, b.user.id));
    const seen: string[] = [];
    spy.mockImplementation(async (scope) => {
      seen.push(scope.userId);
      return [];
    });
    const res = await GET(new Request("https://lifeflow.test/api/cron/notify", { headers: { authorization: "Bearer cron-test-secret" } }));
    expect(res.status).toBe(200);
    spy.mockRestore();
    expect(seen).toContain(a.user.id);
    expect(seen).not.toContain(b.user.id);
  });
});
