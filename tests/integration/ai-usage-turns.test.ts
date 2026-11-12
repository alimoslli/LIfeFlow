import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { aiUsage, users } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { answerText } from "@/server/jarvis/sms";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import type { ModelProvider, ModelTurn } from "@/server/jarvis/providers/types";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 0 };
const NOW = new Date("2026-10-26T14:00:00Z");
const ledger = (userId: string) => withUser(userId, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, userId)).orderBy(aiUsage.createdAt));
const sessionOf = (u: { user: { id: string; email: string; name: string } }): SessionUser => ({
  id: u.user.id,
  email: u.user.email,
  name: u.user.name,
  timezone: TZ,
  accountKind: "standard",
});

describe("chat and texts leave a usage row", () => {
  it("a typed turn writes one chat row with its usage, its run and its cost", async () => {
    const u = await makeUser();
    const provider = new ScriptedProvider(() => ({ text: "Hi.", usage }));
    const r = await runJarvisTurn({
      user: sessionOf(u),
      text: "hello",
      provider,
      emit: () => {},
      now: NOW,
      prices: { inputPerMTok: 2, outputPerMTok: 8, forModel: "scripted" },
    });
    const rows = await ledger(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "chat",
      door: "chat_route",
      provider: "scripted",
      state: "settled",
      conversationId: r.conversationId,
      runId: r.runId,
      inputTokens: 1000,
      outputTokens: 100,
      steps: 1,
      usageFrom: "provider",
      costMicros: 1000 * 2 + 100 * 8,
      countedMicros: 2800,
    });
  });

  it("without prices the cost is empty, not 0", async () => {
    const u = await makeUser();
    await runJarvisTurn({ user: sessionOf(u), text: "hello", provider: new ScriptedProvider(() => ({ text: "Hi.", usage })), emit: () => {}, now: NOW });
    const [row] = await ledger(u.user.id);
    expect(row.costMicros).toBeNull();
    expect(row.priceKey).toBeNull();
    expect(row.inputTokens).toBe(1000);
  });

  it("a failed step still records the usage the earlier steps reported", async () => {
    const u = await makeUser();
    const broken: ModelProvider = {
      name: "scripted",
      model: "scripted",
      startTurn: (): ModelTurn => {
        let n = 0;
        return {
          async *step() {
            if (n++ === 0) {
              yield { type: "step_done", text: "", toolCalls: [{ callId: "c1", name: "list_tasks", arguments: "{}" }], usage };
              return;
            }
            throw Object.assign(new Error("boom"), { status: 503 });
          },
        };
      },
    };
    await runJarvisTurn({ user: sessionOf(u), text: "my tasks", provider: broken, emit: () => {}, now: NOW });
    const rows = await ledger(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "failed", inputTokens: 1000, steps: 2 });
    expect(JSON.stringify(rows[0])).not.toMatch(/boom|my tasks/);
  });

  it("a text writes an sms row with a cost when prices are passed in", async () => {
    const db = getDb();
    const u = await makeUser("Texter");
    await db.update(users).set({ smsPhone: "+14045550155", plan: "pro" }).where(eq(users.id, u.user.id));
    await answerText(db, "+14045550155", "hello", {
      provider: () => new ScriptedProvider(() => ({ text: "Hi.", usage })),
      send: async () => {},
      prices: { inputPerMTok: 2, outputPerMTok: 8, forModel: "scripted" },
    });
    const rows = await ledger(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "sms", door: "sms_inbound", costMicros: 2800 });
  });
});
