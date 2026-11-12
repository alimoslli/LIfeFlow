import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { searchWeb, WebSearchError } from "@/server/integrations/web-search";
import { startVoiceSession } from "@/server/jarvis/voice";
import { reserveBudget, settleBudget } from "@/server/services/ai-budget";
import { AiRefusedError } from "@/server/services/ai-gate";
import { createManualAccount } from "@/server/services/finance/accounts";
import { openAiTidy, tidyTransactions } from "@/server/services/finance/tidy";
import { createTransaction } from "@/server/services/finance/transactions";
import { processDocument } from "@/server/services/inbox";
import { extractDocument } from "@/server/services/inbox/extract";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Every client here is a fake: a counter that answers nothing. Nothing can reach a real provider.
const day = () => todayIn(TZ);
const month = () => day().slice(0, 7);
async function fillUp(userId: string, period: string, what: string, amount: number, kind: "count" | "seconds" = "count") {
  const r = await reserveBudget([{ key: `u:${userId}:${period}:${what}`, kind, amount, limit: null }], 60);
  if (!r.ok || !r.holdId) throw new Error("could not fill the counter");
  await settleBudget(r.holdId, { seconds: amount });
}
const fakeFetchClient = () => {
  const calls = { n: 0 };
  const client = new OpenAI({
    apiKey: "sk",
    baseURL: "http://fake.invalid/v1",
    maxRetries: 0,
    fetch: (async () => {
      calls.n++;
      return new Response("{}", { status: 500 });
    }) as typeof fetch,
  });
  return { client, calls };
};

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
const fakeRealtime = () => {
  const calls = { n: 0 };
  const client = {
    realtime: { clientSecrets: { create: async () => (calls.n++, { value: "ek", expires_at: 1_900_000_000, session: {} }) } },
  } as unknown as OpenAI;
  return { client, calls };
};

describe("voice is limited on the server", () => {
  it("2 calls a day: the third is refused before anything is created", async () => {
    const { session } = await voiceUser();
    const { client, calls } = fakeRealtime();
    await startVoiceSession(session, "home", client);
    await startVoiceSession(session, "home", client);
    await expect(startVoiceSession(session, "home", client)).rejects.toBeInstanceOf(AiRefusedError);
    expect(calls.n).toBe(2);
    await expect(startVoiceSession(session, "home", client)).rejects.toThrow(/You've used today's 2 voice calls/);
  });

  it("10 calls a month, and 30 minutes a month", async () => {
    const a = await voiceUser();
    await fillUp(a.session.id, month(), "vcalls", 10);
    const { client, calls } = fakeRealtime();
    await expect(startVoiceSession(a.session, "home", client)).rejects.toThrow(/10 voice calls.*More open up on [A-Z][a-z]+ 1\./);
    const b = await voiceUser();
    await fillUp(b.session.id, month(), "vsecs", 1700, "seconds"); // 100 seconds left, a call can take up to 180
    await expect(startVoiceSession(b.session, "home", client)).rejects.toThrow(/This month's skyling limit|reached this month's skyling limit/i);
    expect(calls.n).toBe(0);
  });

  it("an early end can't free minutes: the call counts as long as it could have run, so the minutes limit can't be sidestepped", async () => {
    const { session } = await voiceUser();
    const { client } = fakeRealtime();
    const call = await startVoiceSession(session, "home", client);
    const { recordVoiceRun } = await import("@/server/jarvis/voice");
    const { readBudgets } = await import("@/server/services/ai-budget");
    const key = `u:${session.id}:${month()}:vsecs`;
    expect((await readBudgets([key])).get(key)).toEqual({ used: 0, held: call.maxSeconds });
    await recordVoiceRun(session, call.conversationId, { durationMs: 99_999_999, responses: 1, toolCalls: 0, toolErrors: 0, confirmations: 0 });
    const after = (await readBudgets([key])).get(key)!;
    expect(after.held).toBe(0);
    expect(after.used).toBe(call.maxSeconds);
  });

  it("ten calls each ended at once still use up the 30 minutes", async () => {
    const { session } = await voiceUser();
    const { client, calls } = fakeRealtime();
    const { recordVoiceRun } = await import("@/server/jarvis/voice");
    await fillUp(session.id, month(), "vsecs", 1620, "seconds"); // 9 calls' worth
    const call = await startVoiceSession(session, "home", client);
    await recordVoiceRun(session, call.conversationId, { durationMs: 1, responses: 0, toolCalls: 0, toolErrors: 0, confirmations: 0 });
    // the browser says it hung up after a moment, but the minutes are spent: the next call is refused on minutes
    await expect(startVoiceSession(session, "home", client)).rejects.toThrow(/skyling limit/);
    expect(calls.n).toBe(1);
  });

  it("a call whose voice service refuses to create it gives its minutes back", async () => {
    const { session } = await voiceUser();
    const bad = { realtime: { clientSecrets: { create: async () => Promise.reject(Object.assign(new Error("no"), { status: 500 })) } } } as unknown as OpenAI;
    await expect(startVoiceSession(session, "home", bad)).rejects.toThrow();
    const { readBudgets } = await import("@/server/services/ai-budget");
    const key = `u:${session.id}:${month()}:vsecs`;
    expect((await readBudgets([key])).get(key)).toEqual({ used: 0, held: 0 });
  });
});

describe("web search is limited, and a refused search never reaches the provider", () => {
  it("60 a month while prices aren't set", async () => {
    const u = await makeUser();
    await fillUp(u.user.id, month(), "searches", 60);
    const { client, calls } = fakeFetchClient();
    const err = await searchWeb("anything", { userId: u.user.id, door: "chat_tool" }, { search: { client, model: "m" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WebSearchError);
    expect((err as Error).message).toBe("Live web search isn't available right now.");
    expect(calls.n).toBe(0);
  });

  it("a search under the limit goes through and counts one", async () => {
    const u = await makeUser();
    const { client, calls } = fakeFetchClient();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await searchWeb("anything", { userId: u.user.id, door: "chat_tool" }, { search: { client, model: "m" } }).catch(() => undefined);
    log.mockRestore();
    expect(calls.n).toBe(1); // reached the (fake) provider, which refused with 500: nothing billed, so nothing counted
    const { readBudgets } = await import("@/server/services/ai-budget");
    const key = `u:${u.user.id}:${month()}:searches`;
    expect((await readBudgets([key])).get(key)).toEqual({ used: 0, held: 0 });
  });
});

describe("documents are limited: saved, not read, and said plainly", () => {
  it("100 a month while prices aren't set", async () => {
    const u = await makeUser();
    await fillUp(u.user.id, month(), "docs", 100);
    const { client, calls } = fakeFetchClient();
    await expect(extractDocument({ text: "x", files: [], today: day() }, { userId: u.user.id, door: "upload" }, { client, model: "m" })).rejects.toThrow(
      /Saved, but not read yet: this month's skyling allowance is used up\. It opens up again on [A-Z][a-z]+ 1\./,
    );
    expect(calls.n).toBe(0);
  });

  it("the inbox row is kept, marked failed, with that reason", async () => {
    const u = await makeUser();
    await fillUp(u.user.id, month(), "docs", 100);
    const { client } = fakeFetchClient();
    const row = await u.run((s) =>
      processDocument(s, TZ, day(), { channel: "upload", subject: "Bill", text: "x", files: [] }, (i, ctx) => extractDocument(i, ctx!, { client, model: "m" })),
    );
    expect(row.status).toBe("failed");
    expect(row.reason).toMatch(/Saved, but not read yet/);
  });
});

describe("tidying is limited: the rules still run and the AI part waits", () => {
  it("10 runs a day: the AI is not called, the rows stay marked for a later run, and they are asked about later", async () => {
    const u = await makeUser();
    await fillUp(u.user.id, day(), "tidy", 10);
    const acct = await u.run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100000 }));
    await u.run((s) =>
      createTransaction(s, { accountId: acct.id, date: "2026-11-03", description: "ZXQ HOLDINGS 88213 LLC", amountCents: -1800 }, "import", "t:zxq"),
    );
    await u.run((s) => s.tx.update(transactions).set({ merchantName: null, categoryId: null }).where(eq(transactions.userId, s.userId)));
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    process.env.OPENAI_API_KEY ||= "sk-test";
    try {
      const llm = openAiTidy({ userId: u.user.id, door: "plaid_sync" });
      expect(llm).not.toBeNull();
      await u.run((s) => tidyTransactions(s, { llm }));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const [row] = await u.run((s) => s.tx.select({ pending: transactions.tidyAiPending }).from(transactions).where(eq(transactions.userId, s.userId)));
    expect(row.pending).toBe(true);
  });
});

it("a different person's allowance is not affected", async () => {
  const a = await makeUser();
  const b = await makeUser();
  await fillUp(a.user.id, month(), "searches", 60);
  const { client, calls } = fakeFetchClient();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await searchWeb("x", { userId: a.user.id, door: "chat_tool" }, { search: { client, model: "m" } }).catch(() => undefined);
  expect(calls.n).toBe(0); // a is at the limit
  await searchWeb("x", { userId: b.user.id, door: "chat_tool" }, { search: { client, model: "m" } }).catch(() => undefined);
  log.mockRestore();
  expect(calls.n).toBe(1); // b is not
});

describe("tidying degrades on any allowance-check failure, not only a refusal", () => {
  it("a check that can't run leaves the AI part out, the rows pending, and the provider untouched", async () => {
    const u = await makeUser();
    const acct = await u.run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 100000 }));
    await u.run((s) =>
      createTransaction(s, { accountId: acct.id, date: "2026-11-03", description: "QWV HOLDINGS 5521 LLC", amountCents: -1200 }, "import", "t:qwv"),
    );
    await u.run((s) => s.tx.update(transactions).set({ merchantName: null, categoryId: null }).where(eq(transactions.userId, s.userId)));
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    process.env.OPENAI_API_KEY ||= "sk-test";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // a user id that doesn't exist: looking the person up fails, as a database problem would
      const llm = openAiTidy({ userId: "00000000-0000-4000-8000-000000000000", door: "plaid_sync" });
      await u.run((s) => tidyTransactions(s, { llm }));
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const [row] = await u.run((s) => s.tx.select({ pending: transactions.tidyAiPending }).from(transactions).where(eq(transactions.userId, s.userId)));
    expect(row.pending).toBe(true);
  });
});
