import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { aiUsage, jarvisRuns } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { OpenAIProvider } from "@/server/jarvis/providers/openai";
import { seedEvalStudent } from "../fixtures/eval-student";
import { EVAL_NOW } from "../fixtures/jarvis-eval";

/**
 * Which model really gets each request (owner's yes, 2026-11-12: plain lookups on the small model; the COO's rule: money
 * never). The real assistant loop and the real OpenAI request body, against a fake fetch that answers in one word. Nothing
 * reaches a provider.
 */
afterAll(closeDb);

function recording(models: string[], first?: { name: string; args: unknown }, smallFails?: number) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const model = (JSON.parse(String(init.body)) as { model: string }).model;
    models.push(model);
    if (smallFails && model === "gpt-5.4-mini")
      return new Response(JSON.stringify({ error: { message: "The server is busy.", type: "server_error" } }), {
        status: smallFails,
        headers: { "content-type": "application/json" },
      });
    const usage = { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
    const output =
      first && models.length === 1
        ? [{ type: "function_call", id: "f1", call_id: "c1", name: first.name, arguments: JSON.stringify(first.args), status: "completed" }]
        : [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }];
    const events = [
      { type: "response.output_text.delta", sequence_number: 0, item_id: "m1", output_index: 0, content_index: 0, delta: "ok", logprobs: [] },
      { type: "response.completed", sequence_number: 1, response: { id: "r", object: "response", status: "completed", output, usage } },
    ];
    return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;
  return new OpenAIProvider({ apiKey: "sk-fake", model: "gpt-5.5", smallModel: "gpt-5.4-mini", baseURL: "http://fake.invalid/v1", fetch: fetchImpl });
}

const LOOKUPS = [
  "What do I need to get done today?",
  "What's due this week?",
  "Which day this week is going to be the hardest?",
  "Do I have anything overdue?",
];
// every money question in the eval and the paid try-out (docs/backlog/2026-11-12-model-costs.md), and a few more
const MONEY = [
  "Can I afford to spend $60 this weekend?",
  "Where did my money go last month?",
  "What subscriptions am I paying for?",
  "How many hours am I working this week and how much will I make?",
  "Am I on track for my savings goal?",
  "When was the last time I Zelled Omar Mousselli?",
  "I work Wednesday night and have the BIO exam Thursday morning, when should I study and can I still afford groceries?",
  "What's my balance?",
  "When is rent due?",
  "Do I have any bills this week?",
  // money said without a money word (COO review)
  "Is 40 too much for dinner?",
  "How do we split the pizza?",
  "What's left this week?",
  "What's €15 for?",
];

describe("the small model gets plain lookups and never a money question", () => {
  it("routes each question's real requests to the right model", async () => {
    const { session } = await seedEvalStudent();
    const ask = async (text: string) => {
      const models: string[] = [];
      await runJarvisTurn({ user: session, text, provider: recording(models), emit: () => {}, now: EVAL_NOW });
      return models;
    };
    for (const q of LOOKUPS) expect(await ask(q), q).toEqual(["gpt-5.4-mini"]);
    for (const q of MONEY) {
      const models = await ask(q);
      expect(models.length, q).toBeGreaterThan(0);
      expect(models, q).not.toContain("gpt-5.4-mini");
    }
  }, 120_000);

  it("a lookup whose answer needs the money tools moves to the main model as soon as they load", async () => {
    const { session } = await seedEvalStudent();
    const models: string[] = [];
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(models, { name: "load_tools", args: { groups: ["money"] } }),
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    // and loading something else keeps the small model
    const other: string[] = [];
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(other, { name: "load_tools", args: { groups: ["health"] } }),
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(other).toEqual(["gpt-5.4-mini", "gpt-5.4-mini"]);
  });

  it("a lookup that reads the daily briefing (it carries money) is worded by the main model; a school lookup stays small", async () => {
    const { session } = await seedEvalStudent();
    const day: string[] = [];
    await runJarvisTurn({
      user: session,
      text: "What do I need to get done today?",
      provider: recording(day, { name: "get_daily_briefing", args: {} }),
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(day).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    const school: string[] = [];
    await runJarvisTurn({
      user: session,
      text: "When is my BIO exam?",
      provider: recording(school, { name: "list_assignments", args: {} }),
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(school).toEqual(["gpt-5.4-mini", "gpt-5.4-mini"]);
  });

  it("when the small model has a bad moment (503) before it says anything, the main model answers the same turn, counted once", async () => {
    const { session, run } = await seedEvalStudent();
    const models: string[] = [];
    const events: { type: string }[] = [];
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(models, undefined, 503),
      emit: (e) => events.push(e),
      now: EVAL_NOW,
    });
    // one try on the small model (no retries), then the main model answers
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    expect(events.some((e) => e.type === "error")).toBe(false);
    const usage = await run((s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, session.id)));
    expect(usage).toHaveLength(1);
    expect(usage[0].model).toBe("gpt-5.5");
    const [r] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.userId, session.id)));
    expect(r.model).toBe("gpt-5.5");
  });
});
