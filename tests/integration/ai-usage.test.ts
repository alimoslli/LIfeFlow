import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { aiUsage, conversations } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { priceTokens, pickPrices, webSearchFeeMicros } from "@/server/services/ai-prices";
import { recordAi, sumUsage } from "@/server/services/ai-usage";
import { makeUser } from "../helpers";

afterAll(closeDb);

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: 100 };
const rows = (userId: string) => withUser(userId, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, userId)));

describe("the usage record", () => {
  it("is private to its owner", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    await recordAi({ userId: a.user.id, feature: "chat", door: "chat_route", provider: "openai", model: "m", usage });
    expect(await rows(a.user.id)).toHaveLength(1);
    expect(await rows(b.user.id)).toHaveLength(0);
    // even filtering on A's id from B's scope shows nothing
    expect(await withUser(b.user.id, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, a.user.id)))).toHaveLength(0);
  });

  it("keeps an unknown cost empty, never 0, and counts the estimate instead", async () => {
    const a = await makeUser();
    await recordAi({
      userId: a.user.id,
      feature: "web_search",
      door: "chat_tool",
      provider: "openai",
      model: "m",
      usage,
      costMicros: null,
      estimateMicros: 40_000,
    });
    const [r] = await rows(a.user.id);
    expect(r.costMicros).toBeNull();
    expect(r.priceKey).toBeNull();
    expect(r.countedMicros).toBe(40_000);
    expect(r.usageFrom).toBe("provider");
  });

  it("counts the measured cost when it is known", async () => {
    const a = await makeUser();
    await recordAi({
      userId: a.user.id,
      feature: "chat",
      door: "chat_route",
      provider: "openai",
      model: "m",
      usage,
      costMicros: 2500,
      priceKey: "m",
      estimateMicros: 9000,
    });
    const [r] = await rows(a.user.id);
    expect(r.costMicros).toBe(2500);
    expect(r.countedMicros).toBe(2500);
    expect(r.priceKey).toBe("m");
  });

  it("survives deleting the chat it came from", async () => {
    const a = await makeUser();
    const conv = await a.run(async (s) => (await s.tx.insert(conversations).values({ userId: s.userId, title: "t" }).returning({ id: conversations.id }))[0]);
    await recordAi({ userId: a.user.id, feature: "chat", door: "chat_route", provider: "openai", model: "m", usage, conversationId: conv.id, costMicros: 10 });
    await a.run((s) => s.tx.delete(conversations).where(eq(conversations.id, conv.id)));
    const [r] = await rows(a.user.id);
    expect(r.conversationId).toBeNull();
    expect(r.costMicros).toBe(10);
  });

  it("is removed with the account", async () => {
    const a = await makeUser();
    await recordAi({ userId: a.user.id, feature: "tidy", door: "plaid_sync", provider: "openai", model: "m" });
    const { users } = await import("@/server/db/schema");
    await getDb().delete(users).where(eq(users.id, a.user.id));
    expect(await rows(a.user.id)).toHaveLength(0);
  });
});

describe("prices", () => {
  const main = { inputPerMTok: 2, outputPerMTok: 10, forModel: "big" };
  const small = { inputPerMTok: 0.5, outputPerMTok: 2, forModel: "mini" };

  it("price a model only with the prices copied for that model", () => {
    expect(priceTokens("big", usage, main, small).costMicros).toBe(1000 * 2 + 500 * 10);
    expect(priceTokens("mini", usage, main, small)).toEqual({ costMicros: 1000 * 0.5 + 500 * 2, priceKey: "mini" });
  });

  it("leave the cost empty for a stale price, a missing price, or no usage", () => {
    expect(priceTokens("newer-model", usage, main, small)).toEqual({ costMicros: null, priceKey: null });
    expect(priceTokens("big", usage, {}, undefined)).toEqual({ costMicros: null, priceKey: null });
    expect(priceTokens("big", usage, { ...main, outputPerMTok: undefined }, small).costMicros).toBeNull();
    expect(priceTokens("big", null, main, small).costMicros).toBeNull();
    expect(pickPrices(null, main, small)).toBeNull();
  });

  it("keeps old behaviour for prices without a model name", () => {
    expect(pickPrices("x", { inputPerMTok: 1, outputPerMTok: 1 }, { inputPerMTok: 9, outputPerMTok: 9 }, "x")?.inputPerMTok).toBe(1);
    expect(pickPrices("y", { inputPerMTok: 1, outputPerMTok: 1 }, { inputPerMTok: 9, outputPerMTok: 9 }, "x")?.inputPerMTok).toBe(9);
  });

  it("has no search fee unless one is configured", () => {
    expect(webSearchFeeMicros({} as never)).toBeNull();
    expect(webSearchFeeMicros({ JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS: 10 } as never)).toBe(10_000);
  });

  it("sums reported usage and gives null when nothing was reported", () => {
    expect(sumUsage([null, undefined])).toBeNull();
    expect(sumUsage([usage, usage, null])).toEqual({ inputTokens: 2000, cachedInputTokens: 0, outputTokens: 1000, reasoningTokens: 200 });
  });
});
