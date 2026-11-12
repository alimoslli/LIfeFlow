import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { aiUsage, jarvisRuns, messages, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { answerText } from "@/server/jarvis/sms";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import type { ModelProvider, ModelTurn } from "@/server/jarvis/providers/types";
import { readBudgets } from "@/server/services/ai-budget";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 0 };
const NOW = new Date("2026-10-26T14:00:00Z");
const sessionOf = (u: { user: { id: string; email: string; name: string } }): SessionUser => ({
  id: u.user.id,
  email: u.user.email,
  name: u.user.name,
  timezone: TZ,
  accountKind: "standard",
});

/** A fake model that only counts how often it is asked. It can never reach a real provider. */
function counting(opts: { delayMs?: number; text?: string; fail?: { status: number } } = {}) {
  const calls = { steps: 0 };
  const provider: ModelProvider = {
    name: "scripted",
    model: "scripted",
    startTurn: (): ModelTurn => ({
      async *step() {
        calls.steps++;
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (opts.fail) throw Object.assign(new Error("provider said no"), { status: opts.fail.status });
        yield { type: "step_done", text: opts.text ?? "Hi.", toolCalls: [], usage };
      },
    }),
  };
  return { provider, calls };
}

const turn = (u: Awaited<ReturnType<typeof makeUser>>, provider: ModelProvider, extra: Partial<Parameters<typeof runJarvisTurn>[0]> = {}) => {
  const events: JarvisEvent[] = [];
  return runJarvisTurn({ user: sessionOf(u), text: "hello", provider, emit: (e) => events.push(e), now: NOW, ...extra }).then((r) => ({ ...r, events }));
};
const ledger = (id: string) => withUser(id, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, id)));
const day = () => todayIn(TZ);

describe("messages are limited per person, and refused work never reaches the model", () => {
  it("the third message of a 2-a-day allowance is refused in plain words and the fake model is not called", async () => {
    const u = await makeUser();
    const { provider, calls } = counting();
    const limits = { msgsPerDay: 2 };
    await turn(u, provider, { aiLimits: limits });
    await turn(u, provider, { aiLimits: limits });
    expect(calls.steps).toBe(2);
    const third = await turn(u, provider, { aiLimits: limits });
    expect(calls.steps).toBe(2); // never asked
    expect(third.refused).toMatchObject({ scope: "person", what: "msgs", period: "day" });
    const err = third.events.find((e) => e.type === "error");
    expect(err).toMatchObject({ type: "error", message: expect.stringMatching(/You've used today's 2 messages/) });
    expect(JSON.stringify(third.events)).not.toMatch(/token|openai|gpt/i);
    // the refusal is saved in the thread, the run is recorded (every turn has a row), and it is not billed as a use
    const saved = await u.run((s) =>
      s.tx
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, third.conversationId), eq(messages.role, "assistant"))),
    );
    expect(saved[0]).toMatchObject({ status: "error" });
    const runs = await u.run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.conversationId, third.conversationId)));
    expect(runs).toMatchObject([{ outcome: "error", errorKind: "limit" }]);
    expect((await ledger(u.user.id)).filter((r) => r.state !== "failed")).toHaveLength(2);
    expect(await ledger(u.user.id)).toHaveLength(2);
  });

  it("ten messages sent at the same moment with room for three: exactly three reach the model", async () => {
    const u = await makeUser();
    const { provider, calls } = counting({ delayMs: 50 });
    const results = await Promise.all(Array.from({ length: 10 }, () => turn(u, provider, { aiLimits: { msgsPerDay: 3 } })));
    expect(calls.steps).toBe(3);
    expect(results.filter((r) => r.refused)).toHaveLength(7);
    const seen = await readBudgets([`u:${u.user.id}:${day()}:msgs`]);
    expect(seen.get(`u:${u.user.id}:${day()}:msgs`)).toEqual({ used: 3, held: 0 });
  });

  it("an admin has no per-person limit", async () => {
    const u = await makeUser("Owner");
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = u.user.email;
    await getDb().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, u.user.id));
    try {
      const { provider, calls } = counting();
      const limits = { msgsPerDay: 1 };
      await turn(u, provider, { aiLimits: limits });
      const again = await turn(u, provider, { aiLimits: limits });
      expect(again.refused).toBeFalsy();
      expect(calls.steps).toBe(2);
    } finally {
      process.env.ADMIN_EMAILS = prev;
    }
  });

  it("a text counts as a message too, and a limit notice goes out at most once a day", async () => {
    const db = getDb();
    const u = await makeUser("Texter");
    await db.update(users).set({ smsPhone: "+14045550144", plan: "pro" }).where(eq(users.id, u.user.id));
    // 30 messages a day while testing: use them up with chat, then text
    const { provider } = counting();
    for (let i = 0; i < 30; i++) await turn(u, provider);
    const sent: string[] = [];
    const deps = { provider: () => counting().provider, send: async (_to: string, t: string) => void sent.push(t) };
    const first = await answerText(db, "+14045550144", "hi", deps);
    expect(first).toMatch(/You've used today's 30 messages/);
    expect(sent).toHaveLength(1);
    const second = await answerText(db, "+14045550144", "hi again", deps);
    expect(second).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe("a provider that refuses before doing any work doesn't use up a message", () => {
  it("a 503 gives the set-aside back", async () => {
    const u = await makeUser();
    const down = counting({ fail: { status: 503 } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await turn(u, down.provider, { aiLimits: { msgsPerDay: 1 } });
    log.mockRestore();
    expect(down.calls.steps).toBe(1);
    const ok = counting();
    const next = await turn(u, ok.provider, { aiLimits: { msgsPerDay: 1 } });
    expect(next.refused).toBeFalsy();
    expect(ok.calls.steps).toBe(1);
  });

  it("an error without a provider answer may have been billed, so it counts", async () => {
    const u = await makeUser();
    const broken: ModelProvider = {
      name: "scripted",
      model: "scripted",
      startTurn: () => ({
        async *step() {
          throw new Error("socket hang up");
        },
      }),
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await turn(u, broken, { aiLimits: { msgsPerDay: 1 } });
    log.mockRestore();
    const next = await turn(u, counting().provider, { aiLimits: { msgsPerDay: 1 } });
    expect(next.refused).toMatchObject({ what: "msgs" });
  });
});

describe("the monthly dollar allowance counts only where a price is configured", () => {
  const prices = { inputPerMTok: 2, outputPerMTok: 8, forModel: "scripted" };

  it("with prices: refuses a step whose estimate would pass the allowance, and settles with the real cost", async () => {
    const u = await makeUser();
    const { provider, calls } = counting();
    // one step estimates about 8000 output tokens x $8/M plus the prompt: well over $0.01
    const tiny = { microsPerMonth: 10_000 };
    const r = await turn(u, provider, { prices, aiLimits: tiny });
    expect(calls.steps).toBe(0);
    expect(r.refused).toMatchObject({ what: "micros", period: "month" });
    // a roomy allowance lets it through, and the settled cost (not the estimate) is what stays counted
    const ok = await turn(u, provider, { prices, aiLimits: { microsPerMonth: 4_000_000 } });
    expect(ok.refused).toBeFalsy();
    const month = day().slice(0, 7);
    const seen = (await readBudgets([`u:${u.user.id}:${month}:micros`])).get(`u:${u.user.id}:${month}:micros`)!;
    expect(seen).toEqual({ used: 1000 * 2 + 100 * 8, held: 0 });
  });

  it("without prices nothing is counted in dollars, so the counted limits are what hold", async () => {
    const u = await makeUser();
    const { provider, calls } = counting();
    const r = await turn(u, provider, { aiLimits: { microsPerMonth: 1 } }); // a one-micro allowance, but no price: not counted
    expect(r.refused).toBeFalsy();
    expect(calls.steps).toBe(1);
    const month = day().slice(0, 7);
    expect((await readBudgets([`u:${u.user.id}:${month}:micros`])).get(`u:${u.user.id}:${month}:micros`)).toEqual({ used: 0, held: 0 });
  });

  it("a price copied for a different model counts as no price", async () => {
    const u = await makeUser();
    const { provider } = counting();
    const r = await turn(u, provider, { prices: { ...prices, forModel: "some-older-model" }, aiLimits: { microsPerMonth: 1 } });
    expect(r.refused).toBeFalsy();
  });
});

describe("deleting a chat does not reset an allowance", () => {
  it("the counters and the usage rows stay", async () => {
    const u = await makeUser();
    const { provider } = counting();
    const a = await turn(u, provider, { aiLimits: { msgsPerDay: 1 } });
    const { conversations } = await import("@/server/db/schema");
    await u.run((s) => s.tx.delete(conversations).where(eq(conversations.id, a.conversationId)));
    const again = await turn(u, provider, { aiLimits: { msgsPerDay: 1 } });
    expect(again.refused).toMatchObject({ what: "msgs" });
    expect((await ledger(u.user.id)).length).toBeGreaterThanOrEqual(1);
  });
});

describe("leftovers", () => {
  it("a scripted turn still records its run", async () => {
    const u = await makeUser();
    await turn(u, new ScriptedProvider(() => ({ text: "ok", usage })));
    expect(await u.run((s) => s.tx.select().from(jarvisRuns).where(like(jarvisRuns.provider, "scripted")))).toHaveLength(1);
  });
});
