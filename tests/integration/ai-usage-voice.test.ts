import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb } from "@/server/db/client";
import { aiUsage } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { recordVoiceRun, startVoiceSession } from "@/server/jarvis/voice";
import { expireStaleAiUsage, HELD_ROW_MAX_AGE_MS, settleVoiceUsage } from "@/server/services/ai-usage";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Only an injected fake: no call here can reach a real voice service.
const fakeOpenAI = () =>
  ({ realtime: { clientSecrets: { create: async () => ({ value: "ek_test", expires_at: 1_900_000_000, session: {} }) } } }) as unknown as OpenAI;
const ledger = (userId: string) => withUser(userId, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, userId)).orderBy(aiUsage.createdAt));

async function voiceUser() {
  const u = await makeUser("Caller");
  const session: SessionUser = {
    id: u.user.id,
    email: u.user.email,
    name: u.user.name,
    timezone: TZ,
    accountKind: "standard",
    preferences: { aiConsentAt: "2026-01-01T00:00:00.000Z" },
  };
  process.env.OPENAI_API_KEY ||= "sk-test";
  return { ...u, session };
}
const stats = { durationMs: 5_000_000, responses: 1, toolCalls: 0, toolErrors: 0, confirmations: 0 };

describe("voice usage from our own clock", () => {
  it("holds the longest call when it starts, and settles with our clock, not the browser's", async () => {
    const { session } = await voiceUser();
    const call = await startVoiceSession(session, "home", fakeOpenAI());
    let [r] = await ledger(session.id);
    expect(r).toMatchObject({
      feature: "voice",
      door: "voice_session",
      state: "held",
      seconds: call.maxSeconds,
      holdId: call.voiceSessionId,
      usageFrom: "server_clock",
      costMicros: null,
    });
    // the browser claims an 83-minute call with token counts; our clock says a few seconds
    await recordVoiceRun(session, call.conversationId, { ...stats, inputTokens: 123, outputTokens: 45 });
    [r] = await ledger(session.id);
    expect(r.state).toBe("settled");
    expect(r.seconds).toBeLessThan(10);
    expect(r).toMatchObject({ usageFrom: "browser", inputTokens: 123, outputTokens: 45, costMicros: null });
  });

  it("never lets the browser report a longer call than was reserved plus a minute", async () => {
    const { session } = await voiceUser();
    const call = await startVoiceSession(session, "home", fakeOpenAI());
    const later = new Date(Date.now() + 3 * 3600_000);
    const done = await settleVoiceUsage(session.id, call.conversationId, {}, later);
    expect(done?.seconds).toBe(call.maxSeconds + 60);
  });

  it("a second end changes nothing", async () => {
    const { session } = await voiceUser();
    const call = await startVoiceSession(session, "home", fakeOpenAI());
    await recordVoiceRun(session, call.conversationId, stats);
    const [first] = await ledger(session.id);
    await recordVoiceRun(session, call.conversationId, { ...stats, inputTokens: 999 });
    const rows = await ledger(session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seconds: first.seconds, inputTokens: null });
  });

  it("with no end from the browser, the row stays held, then is closed as expired with the reserved time kept", async () => {
    const { session, run } = await voiceUser();
    const call = await startVoiceSession(session, "home", fakeOpenAI());
    expect((await ledger(session.id))[0].state).toBe("held");
    await run((s) => expireStaleAiUsage(s, new Date()));
    expect((await ledger(session.id))[0].state).toBe("held"); // too soon
    await run((s) => expireStaleAiUsage(s, new Date(Date.now() + HELD_ROW_MAX_AGE_MS + 1000)));
    const [r] = await ledger(session.id);
    expect(r).toMatchObject({ state: "expired", seconds: call.maxSeconds, costMicros: null });
  });

  it("a failed call is recorded as failed", async () => {
    const { session } = await voiceUser();
    const call = await startVoiceSession(session, "home", fakeOpenAI());
    await recordVoiceRun(session, call.conversationId, { ...stats, error: "x" });
    expect((await ledger(session.id))[0].state).toBe("failed");
  });
});
