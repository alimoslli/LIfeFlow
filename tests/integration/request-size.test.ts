import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { OpenAIProvider } from "@/server/jarvis/providers/openai";
import { seedEvalStudent } from "../fixtures/eval-student";
import { EVAL, EVAL_NOW } from "../fixtures/jarvis-eval";

/**
 * What one answer really sends today, for the cost report (docs/backlog/2026-11-12-long-chat-trim.md). Free: the real
 * assistant loop and the real OpenAI request body, against a fake fetch that answers with the eval's own tool plan
 * and its perfect answer. Nothing reaches a provider. Runs only with MEASURE_OUT=<file>, which gets every request body's
 * parts as characters; the report counts them with OpenAI's public tokenizer.
 */
afterAll(closeDb);

type Body = { model: string; instructions: string; input: unknown[]; tools: unknown[] };

function fakeProvider(plan: { tool: string; args: Record<string, unknown> }[], answer: string, bodies: Body[]) {
  let n = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const first = n++ === 0 && plan.length > 0;
    const usage = { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
    const output = first
      ? plan.map((p, i) => ({ type: "function_call", id: `fc${i}`, call_id: `c${i}`, name: p.tool, arguments: JSON.stringify(p.args), status: "completed" }))
      : [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: answer, annotations: [] }] }];
    const ev = { type: "response.completed", sequence_number: 1, response: { id: "r", object: "response", status: "completed", output, usage } };
    // the answer streams as text, as the real model's does, so it is saved as the turn's answer
    const delta = { type: "response.output_text.delta", sequence_number: 0, item_id: "m1", output_index: 0, content_index: 0, delta: answer, logprobs: [] };
    const events = first ? [ev] : [delta, ev];
    const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return new OpenAIProvider({ apiKey: "sk-fake", model: "gpt-5.5", smallModel: "gpt-5.4-mini", baseURL: "http://fake.invalid/v1", fetch: fetchImpl });
}

const parts = (b: Body) => ({
  model: b.model,
  instructions: b.instructions.length,
  tools: JSON.stringify(b.tools).length,
  toolCount: b.tools.length,
  input: JSON.stringify(b.input).length,
  inputItems: b.input.length,
  // the per-request part of the system text (buildContext): everything after the static INSTRUCTIONS
  text: { instructions: b.instructions, tools: JSON.stringify(b.tools), input: JSON.stringify(b.input) },
});

describe.skipIf(!process.env.MEASURE_OUT)("request size per answer (measurement only)", () => {
  it("measures every eval question, fresh and as one chat", async () => {
    const { session } = await seedEvalStudent();
    const out: Record<string, unknown>[] = [];
    // each question in a new chat
    for (const c of EVAL) {
      const bodies: Body[] = [];
      await runJarvisTurn({ user: session, text: c.question, provider: fakeProvider(c.plan, c.answer, bodies), emit: () => {}, now: EVAL_NOW });
      out.push({ id: c.id, mode: "fresh", steps: bodies.map(parts) });
    }
    // the same questions one after another in one chat (history grows, as on a busy day)
    let conversationId: string | null = null;
    for (const c of EVAL) {
      const bodies: Body[] = [];
      const r = await runJarvisTurn({
        user: session,
        conversationId,
        text: c.question,
        provider: fakeProvider(c.plan, c.answer, bodies),
        emit: () => {},
        now: EVAL_NOW,
      });
      conversationId = r.conversationId;
      out.push({ id: c.id, mode: "one-chat", steps: bodies.map(parts) });
    }
    writeFileSync(process.env.MEASURE_OUT!, JSON.stringify(out));
    expect(out.length).toBe(EVAL.length * 2);
  }, 300_000);
});
