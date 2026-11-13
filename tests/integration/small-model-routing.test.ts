import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { aiUsage, jarvisRuns, messages } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { groupOf } from "@/server/jarvis/tool-groups";
import { OpenAIProvider } from "@/server/jarvis/providers/openai";
import { seedEvalStudent } from "../fixtures/eval-student";
import { EVAL_NOW } from "../fixtures/jarvis-eval";

/**
 * Which model really gets each request (owner's yes, 2026-11-12: plain lookups on the small model; the COO's rule: money
 * never). The real assistant loop and the real OpenAI request body, against a fake fetch that answers in one word. Nothing
 * reaches a provider.
 */
afterAll(closeDb);

type Call = { name: string; args: unknown };
function recording(
  models: string[],
  first?: Call | Call[],
  smallFails?: number,
  bodies?: { model: string; input: { type?: string; output?: string }[] }[],
  mainBreaks?: boolean,
) {
  const firstCalls = first ? (Array.isArray(first) ? first : [first]) : [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { model: string; input: { type?: string; output?: string }[] };
    const model = body.model;
    models.push(model);
    bodies?.push(body);
    if (smallFails && model === "gpt-5.4-mini")
      return new Response(JSON.stringify({ error: { message: "The server is busy.", type: "server_error" } }), {
        status: smallFails,
        headers: { "content-type": "application/json" },
      });
    if (mainBreaks && model === "gpt-5.5") {
      // it starts answering (and may have billed), then the stream breaks
      const broken = [
        { type: "response.output_text.delta", sequence_number: 0, item_id: "m1", output_index: 0, content_index: 0, delta: "Your", logprobs: [] },
        { type: "error", sequence_number: 1, code: "server_error", message: "stream broke", param: null },
      ];
      return new Response(broken.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    const usage = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
    const output =
      firstCalls.length && models.length === 1
        ? firstCalls.map((c, i) => ({
            type: "function_call",
            id: `f${i}`,
            call_id: `c${i}`,
            name: c.name,
            arguments: JSON.stringify(c.args),
            status: "completed",
          }))
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
  // COO review 4
  "What's the total?",
  "What's my net?",
  "What's my tab?",
  "What's in my wallet?",
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

  it("a tool outside the turn's groups never runs, and the user sees nothing of it: only the model hears why", async () => {
    const { session, run } = await seedEvalStudent();
    const models: string[] = [];
    const bodies: { model: string; input: { type?: string; output?: string }[] }[] = [];
    const shown: { type: string; name?: string; summary?: string }[] = [];
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(models, { name: "money_overview", args: {} }, undefined, bodies),
      emit: (e) => shown.push(e as { type: string; name?: string }),
      now: EVAL_NOW,
    });
    // no tool card, no tool row, nothing that names a tool or speaks to the model
    expect(shown.filter((e) => e.type === "tool_start" || e.type === "tool_end")).toEqual([]);
    expect(JSON.stringify(shown)).not.toMatch(/load_tools|isn't loaded/);
    const rows = await run((s) =>
      s.tx
        .select()
        .from(messages)
        .where(and(eq(messages.userId, session.id), eq(messages.toolName, "money_overview"))),
    );
    expect(rows).toEqual([]);
    // the model gets the refusal, and the turn stays small (nothing with money ran)
    expect(bodies[1].input.find((i) => i.type === "function_call_output")?.output).toContain("isn't loaded for this answer");
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.4-mini"]);
  });

  it("each step is priced by the model that ran it, and the turn's cost is their sum", async () => {
    const { session, run } = await seedEvalStudent();
    const models: string[] = [];
    const prices = { inputPerMTok: 5, cachedInputPerMTok: 0.5, outputPerMTok: 30, forModel: "gpt-5.5" };
    const smallPrices = { inputPerMTok: 0.75, cachedInputPerMTok: 0.075, outputPerMTok: 4.5, forModel: "gpt-5.4-mini" };
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(models, { name: "load_tools", args: { groups: ["money"] } }),
      prices,
      smallPrices,
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    // 1,000 in and 100 out each: the small step 750 + 450 = 1,200 micros, the main step 5,000 + 3,000 = 8,000
    const small = 1000 * 0.75 + 100 * 4.5;
    const main = 1000 * 5 + 100 * 30;
    const [usage] = await run((s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, session.id)));
    expect(usage.costMicros).toBe(small + main);
    const [r] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.userId, session.id)));
    expect(r.costMicros).toBe(small + main);
    expect(r.model).toBe("gpt-5.5");
    // the price key names both prices the sum came from (COO review 5)
    expect(usage.priceKey).toBe("gpt-5.4-mini+gpt-5.5");
  });

  it("mail, notes, web and file tools can carry money: each moves the rest of the turn to the main model", async () => {
    for (const tool of ["search_email", "read_email", "read_attachment", "web_search", "search_notes", "get_note"]) {
      const { session } = await seedEvalStudent();
      const models: string[] = [];
      await runJarvisTurn({
        user: session,
        text: "What's due this week?",
        provider: recording(models, [
          { name: "load_tools", args: { groups: [groupOf(tool)] } },
          { name: tool, args: {} },
        ]),
        emit: () => {},
        now: EVAL_NOW,
      });
      expect(models, tool).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    }
  }, 60_000);

  it('"autopaying tomorrow?" starts small and moves to the main model once the money comes back', async () => {
    const { session } = await seedEvalStudent();
    const models: string[] = [];
    await runJarvisTurn({
      user: session,
      text: "Autopaying tomorrow?",
      provider: recording(models, { name: "tonight", args: {} }),
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
  });

  it("a step that fails after it started billing makes the turn's cost unknown, never a sum that leaves it out", async () => {
    const { session, run } = await seedEvalStudent();
    const models: string[] = [];
    const prices = { inputPerMTok: 5, cachedInputPerMTok: 0.5, outputPerMTok: 30, forModel: "gpt-5.5" };
    const smallPrices = { inputPerMTok: 0.75, cachedInputPerMTok: 0.075, outputPerMTok: 4.5, forModel: "gpt-5.4-mini" };
    await runJarvisTurn({
      user: session,
      text: "What's due this week?",
      provider: recording(models, { name: "load_tools", args: { groups: ["money"] } }, undefined, undefined, true),
      prices,
      smallPrices,
      emit: () => {},
      now: EVAL_NOW,
    });
    expect(models).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    const [usage] = await run((s) => s.tx.select().from(aiUsage).where(eq(aiUsage.userId, session.id)));
    expect(usage.costMicros).toBeNull();
    expect(usage.priceKey).toBeNull();
    const [r] = await run((s) => s.tx.select().from(jarvisRuns).where(eq(jarvisRuns.userId, session.id)));
    expect(r.costMicros).toBeNull();
  });
});
