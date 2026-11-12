import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { aiUsage } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { searchWeb, WebSearchError } from "@/server/integrations/web-search";
import { openAiTidy } from "@/server/services/finance/tidy";
import { processDocument } from "@/server/services/inbox";
import { extractDocument, type Extraction } from "@/server/services/inbox/extract";
import { makeUser, TZ } from "../helpers";

// Settings for this file only. Nothing here can reach a real provider: every client talks to a fake fetch.
const settings = vi.hoisted(() => ({
  values: {
    DATABASE_URL: "postgresql://x/y",
    OPENAI_API_KEY: "sk-fake",
    OPENAI_MODEL: "big",
    OPENAI_MODEL_SMALL: "mini",
    OPENAI_BASE_URL: "http://fake.invalid/v1",
    JARVIS_PRICE_INPUT_PER_MTOK: 2,
    JARVIS_PRICE_OUTPUT_PER_MTOK: 10,
    JARVIS_PRICE_SMALL_INPUT_PER_MTOK: 0.5,
    JARVIS_PRICE_SMALL_OUTPUT_PER_MTOK: 2,
    JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS: 10 as number | undefined,
  } as Record<string, unknown>,
}));
vi.mock("@/server/env", () => ({ env: () => settings.values }));

afterAll(closeDb);
afterEach(() => {
  vi.unstubAllGlobals();
  settings.values.JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS = 10;
});

const usage = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
const reply = (output: unknown[], status = 200) =>
  new Response(JSON.stringify(status === 200 ? { id: "r", object: "response", status: "completed", output, usage } : { error: { message: "boom" } }), {
    status,
    headers: { "content-type": "application/json" },
  });
const text = (t: string) => ({
  type: "message",
  role: "assistant",
  status: "completed",
  id: "m",
  content: [{ type: "output_text", text: t, annotations: [] }],
});
const clientOf = (answer: () => Response) =>
  new OpenAI({ apiKey: "sk", baseURL: "http://fake.invalid/v1", maxRetries: 0, fetch: (async () => answer()) as typeof fetch });
const ledger = (userId: string) => withUser(userId, (s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, userId)).orderBy(aiUsage.createdAt));

describe("web search, documents and tidying leave a usage row", () => {
  it("a search records its tokens, its search count and a cost with the fee", async () => {
    const u = await makeUser();
    await searchWeb(
      "cheap plans",
      { userId: u.user.id, door: "chat_tool" },
      { search: { client: clientOf(() => reply([{ type: "web_search_call", id: "w", status: "completed" }, text("Found.")])), model: "big" } },
    );
    const [r] = await ledger(u.user.id);
    expect(r).toMatchObject({ feature: "web_search", door: "chat_tool", model: "big", searchCalls: 1, inputTokens: 1000, outputTokens: 100, state: "settled" });
    expect(r.costMicros).toBe(1000 * 2 + 100 * 10 + 10_000);
    expect(r.priceKey).toBe("big");
  });

  it("a search without a configured fee has an unknown cost, not a smaller one", async () => {
    settings.values.JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS = undefined;
    const u = await makeUser();
    await searchWeb("x", { userId: u.user.id, door: "savings_check" }, { search: { client: clientOf(() => reply([text("Found.")])), model: "big" } });
    const [r] = await ledger(u.user.id);
    expect(r.costMicros).toBeNull();
    expect(r.door).toBe("savings_check");
    expect(r.searchCalls).toBe(1);
  });

  it("a search on a model the prices weren't copied for has an unknown cost", async () => {
    const u = await makeUser();
    await searchWeb("x", { userId: u.user.id, door: "chat_tool" }, { search: { client: clientOf(() => reply([text("ok")])), model: "some-other-model" } });
    expect((await ledger(u.user.id))[0].costMicros).toBeNull();
  });

  it("a failed search is recorded as failed, with no content", async () => {
    const u = await makeUser();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      searchWeb("my secret query", { userId: u.user.id, door: "cancel_help" }, { search: { client: clientOf(() => reply([], 500)), model: "big" } }),
    ).rejects.toThrow(WebSearchError);
    log.mockRestore();
    const [r] = await ledger(u.user.id);
    expect(r).toMatchObject({ state: "failed", door: "cancel_help", costMicros: null });
    expect(JSON.stringify(r)).not.toMatch(/secret|boom/);
  });

  it("reading a document records its usage on the main model", async () => {
    const u = await makeUser();
    const json = JSON.stringify({ type: "other", summary: "s", bill: null, receipt: null, school: null, travel: null, pay: null });
    await extractDocument(
      { text: "hello", files: [], today: "2026-11-12" },
      { userId: u.user.id, door: "upload" },
      { client: clientOf(() => reply([text(json)])), model: "big" },
    );
    const [r] = await ledger(u.user.id);
    expect(r).toMatchObject({ feature: "document", door: "upload", model: "big", costMicros: 2000 + 1000 });
  });

  it("the inbox names the entrance: email, upload, share and Gmail", async () => {
    const u = await makeUser();
    const seen: string[] = [];
    const extract = async (_i: unknown, ctx?: { door: string }) => {
      seen.push(ctx!.door);
      return { type: "other", summary: "s", bill: null, receipt: null, school: null, travel: null, pay: null } as Extraction;
    };
    const today = todayIn(TZ);
    const base = { subject: "x", text: "y", files: [] };
    let n = 0;
    for (const [channel, opts] of [
      ["email", undefined],
      ["upload", undefined],
      ["share", undefined],
      ["email", { door: "gmail_filing" as const }],
    ] as const)
      await u.run((s) => processDocument(s, TZ, today, { ...base, channel, externalId: `t${n++}` }, extract as never, opts));
    expect(seen).toEqual(["email_in", "upload", "share", "gmail_filing"]);
  });

  it("tidying records its AI batch on the small model", async () => {
    const u = await makeUser();
    vi.stubGlobal("fetch", async () => reply([text(JSON.stringify({ items: [] }))]));
    const llm = openAiTidy({ userId: u.user.id, door: "plaid_sync" })!;
    await llm([{ key: "k", text: "ZXQ 1", spent: true }], ["Household"]);
    const [r] = await ledger(u.user.id);
    expect(r).toMatchObject({ feature: "tidy", door: "plaid_sync", model: "mini", costMicros: 1000 * 0.5 + 100 * 2, priceKey: "mini" });
  });
});
