import { describe, expect, it } from "vitest";
import { OpenAIProvider, toResponsesInput } from "@/server/jarvis/providers/openai";
import type { StepEvent } from "@/server/jarvis/providers/types";

/** Builds a fake Responses API SSE stream. */
function sse(events: Record<string, unknown>[]) {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const completed = (output: unknown[], usage?: unknown) => ({
  type: "response.completed",
  sequence_number: 9,
  response: { id: "resp_1", object: "response", status: "completed", output, usage },
});

describe("OpenAI Responses provider", () => {
  it("maps history to Responses input items", () => {
    const input = toResponsesInput([
      { type: "user", text: "hi", images: [{ mimeType: "image/png", base64: "AAAA" }] },
      { type: "assistant", text: "hello" },
      { type: "tool_call", callId: "c1", name: "list_tasks", arguments: "{}" },
      { type: "tool_result", callId: "c1", output: '{"ok":true}' },
    ]);
    expect(input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "hi" },
          { type: "input_image", detail: "auto", image_url: "data:image/png;base64,AAAA" },
        ],
      },
      { role: "assistant", content: "hello" },
      { type: "function_call", call_id: "c1", name: "list_tasks", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: '{"ok":true}' },
    ]);
  });

  it("sends an attached PDF as a file the model reads", () => {
    const [msg] = toResponsesInput([{ type: "user", text: "syllabus", files: [{ filename: "bio.pdf", mimeType: "application/pdf", base64: "JVBERi0=" }] }]);
    expect(msg).toEqual({
      role: "user",
      content: [
        { type: "input_text", text: "syllabus" },
        { type: "input_file", filename: "bio.pdf", file_data: "data:application/pdf;base64,JVBERi0=" },
      ],
    });
  });

  it("streams text, surfaces function calls, and replays outputs + results on the next step", async () => {
    const requests: Record<string, unknown>[] = [];
    let call = 0;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      call++;
      if (call === 1) {
        return sse([
          { type: "response.output_text.delta", delta: "Let me ", sequence_number: 1, item_id: "m", output_index: 0, content_index: 0, logprobs: [] },
          { type: "response.output_text.delta", delta: "check.", sequence_number: 2, item_id: "m", output_index: 0, content_index: 0, logprobs: [] },
          completed([
            { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc" },
            { type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Let me check.", annotations: [] }] },
            { type: "function_call", id: "fc_1", call_id: "call_1", name: "list_tasks", arguments: '{"status":"open"}', status: "completed" },
          ]),
        ]);
      }
      return sse([
        { type: "response.output_text.delta", delta: "You have 2 tasks.", sequence_number: 1, item_id: "m2", output_index: 0, content_index: 0, logprobs: [] },
        completed(
          [
            {
              type: "message",
              id: "m2",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "You have 2 tasks.", annotations: [] }],
            },
          ],
          {
            input_tokens: 900,
            input_tokens_details: { cached_tokens: 768 },
            output_tokens: 40,
            output_tokens_details: { reasoning_tokens: 12 },
            total_tokens: 940,
          },
        ),
      ]);
    }) as unknown as typeof fetch;

    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", reasoningEffort: "low", fetch: fakeFetch });
    const turn = provider.startTurn({
      system: "SYS",
      history: [{ type: "user", text: "tasks?" }],
      tools: [{ name: "list_tasks", description: "d", parameters: { type: "object", properties: {} } }],
    });

    const step1: StepEvent[] = [];
    for await (const e of turn.step()) step1.push(e);
    expect(
      step1
        .filter((e) => e.type === "text_delta")
        .map((e) => (e as { delta: string }).delta)
        .join(""),
    ).toBe("Let me check.");
    expect(step1.at(-1)).toEqual({
      type: "step_done",
      text: "Let me check.",
      toolCalls: [{ callId: "call_1", name: "list_tasks", arguments: '{"status":"open"}' }],
    });

    const step2: StepEvent[] = [];
    for await (const e of turn.step([{ callId: "call_1", output: '{"ok":true,"data":{"count":2}}' }])) step2.push(e);
    expect(step2.at(-1)).toMatchObject({
      type: "step_done",
      text: "You have 2 tasks.",
      toolCalls: [],
      usage: { inputTokens: 900, cachedInputTokens: 768, outputTokens: 40, reasoningTokens: 12 },
    });

    const [r1, r2] = requests;
    expect(r1).toMatchObject({
      model: "gpt-5.5",
      instructions: "SYS",
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      reasoning: { effort: "low" },
    });
    expect((r1.tools as { name: string; type: string }[])[0]).toMatchObject({ type: "function", name: "list_tasks" });
    // Second request carries: original user msg, the 3 output items, then our function_call_output.
    const input2 = r2.input as { type?: string; role?: string }[];
    expect(input2.map((i) => i.type ?? i.role)).toEqual(["user", "reasoning", "message", "function_call", "function_call_output"]);
  });

  it("sends the cache key and 24h retention, thinks at the turn's level, and swaps tools after load_tools", async () => {
    const requests: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return sse([
        completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
      ]);
    }) as unknown as typeof fetch;
    const tool = (name: string) => ({ name, description: "d", parameters: { type: "object", properties: {} } });
    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", reasoningEffort: "auto", cacheRetention: "24h", fetch: fakeFetch });
    const turn = provider.startTurn({
      system: "S",
      history: [{ type: "user", text: "hi" }],
      tools: [tool("list_tasks")],
      cacheKey: "lf-abc",
      effort: "medium",
      verbosity: "low",
    });
    for await (const _ of turn.step()) void _;
    for await (const _ of turn.step([], [tool("list_tasks"), tool("log_health")])) void _;
    expect(requests[0]).toMatchObject({
      prompt_cache_key: "lf-abc",
      prompt_cache_retention: "24h",
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
    });
    expect((requests[1].tools as { name: string }[]).map((t) => t.name)).toEqual(["list_tasks", "log_health"]);

    // A fixed level in settings wins over the turn's level.
    const fixed = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", reasoningEffort: "low", fetch: fakeFetch });
    for await (const _ of fixed.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort: "high" }).step()) void _;
    expect(requests[2]).toMatchObject({ reasoning: { effort: "low" } });
    expect(requests[2]).not.toHaveProperty("prompt_cache_retention");
    expect(requests[2]).not.toHaveProperty("text");
  });

  it("small things go to the small model; plans, money and files stay on the big one (owner, 2026-11-10)", async () => {
    const requests: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return sse([
        completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
      ]);
    }) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", smallModel: "gpt-5.4-mini", reasoningEffort: "auto", fetch: fakeFetch });
    const run = async (effort: "low" | "medium" | "high") => {
      const turn = provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort });
      for await (const _ of turn.step()) void _;
      for await (const _ of turn.step([])) void _; // the second step of the same turn keeps the same model
      return turn.model;
    };
    expect(await run("low")).toBe("gpt-5.4-mini");
    expect(await run("medium")).toBe("gpt-5.5");
    expect(await run("high")).toBe("gpt-5.5");
    expect(requests.map((r) => r.model)).toEqual(["gpt-5.4-mini", "gpt-5.4-mini", "gpt-5.5", "gpt-5.5", "gpt-5.5", "gpt-5.5"]);
    // without a small model set, every turn uses the main one
    const one = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", reasoningEffort: "auto", fetch: fakeFetch });
    const t = one.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort: "low" });
    for await (const _ of t.step()) void _;
    expect(t.model).toBe("gpt-5.5");
    expect(requests.at(-1)!.model).toBe("gpt-5.5");
  });

  it("a small-model turn that loads money tools moves to the main model, without the small model's reasoning", async () => {
    const requests: { model: string; input: { type?: string }[] }[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return requests.length === 1
        ? sse([
            completed([
              { type: "reasoning", id: "rs1", summary: [], encrypted_content: "small-model-only" },
              { type: "function_call", id: "fc1", call_id: "c1", name: "load_tools", arguments: '{"groups":["money"]}', status: "completed" },
            ]),
          ])
        : sse([
            completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
          ]);
    }) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", smallModel: "gpt-5.4-mini", reasoningEffort: "auto", fetch: fakeFetch });
    const turn = provider.startTurn({ system: "S", history: [{ type: "user", text: "anything new?" }], tools: [], effort: "low" });
    for await (const _ of turn.step()) void _;
    for await (const _ of turn.step([{ callId: "c1", output: '{"ok":true}' }], [], { mainModel: true })) void _;
    expect(requests.map((r) => r.model)).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
    expect(turn.model).toBe("gpt-5.5");
    const second = requests[1].input.map((i) => i.type);
    expect(second).not.toContain("reasoning");
    expect(second).toEqual(expect.arrayContaining(["function_call", "function_call_output"]));
  });

  it("a broken stream or a timeout from the small model before any words: the main model answers, and the small one stays in use", async () => {
    for (const trouble of ["broken", "timeout"] as const) {
      const models: string[] = [];
      const fakeFetch = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        models.push(body.model);
        if (body.model === "gpt-5.4-mini") {
          if (trouble === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
          return sse([{ type: "error", code: "server_error", message: "stream broke", param: null, sequence_number: 0 }]);
        }
        return sse([
          { type: "response.output_text.delta", delta: "ok", sequence_number: 1, item_id: "m", output_index: 0, content_index: 0, logprobs: [] },
          completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
        ]);
      }) as unknown as typeof fetch;
      const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", smallModel: "gpt-5.4-mini", reasoningEffort: "auto", fetch: fakeFetch });
      const turn = provider.startTurn({ system: "S", history: [{ type: "user", text: "what's due today?" }], tools: [], effort: "low" });
      const events: StepEvent[] = [];
      for await (const e of turn.step()) events.push(e);
      expect(events.at(-1), trouble).toMatchObject({ type: "step_done", text: "ok" });
      expect(turn.model, trouble).toBe("gpt-5.5");
      expect(models, trouble).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
      // a bad moment doesn't set the small model aside: the next lookup tries it again
      const next = provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort: "low" });
      for await (const _ of next.step()) void _;
      expect(models.at(-2), trouble).toBe("gpt-5.4-mini");
    }
  });

  it("if the small model refuses our request, the main model answers, and the small one is set aside", async () => {
    const models: string[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      models.push(body.model);
      if (body.model === "tiny-refuses")
        return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'text.verbosity'", type: "invalid_request_error" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      return sse([
        completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
      ]);
    }) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", smallModel: "tiny-refuses", reasoningEffort: "auto", fetch: fakeFetch });
    const turn = provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort: "low", verbosity: "low" });
    for await (const _ of turn.step()) void _;
    expect(turn.model).toBe("gpt-5.5");
    // the next small turn doesn't try it again
    const next = provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [], effort: "low" });
    for await (const _ of next.step()) void _;
    expect(models).toEqual(["tiny-refuses", "gpt-5.5", "gpt-5.5"]);
  });

  it("drops 24h retention once if the model refuses it, and keeps answering", async () => {
    const requests: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      if (body.prompt_cache_retention)
        return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'prompt_cache_retention' is not supported with this model." } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      return sse([
        { type: "response.output_text.delta", delta: "ok", sequence_number: 1, item_id: "m", output_index: 0, content_index: 0, logprobs: [] },
        completed([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }]),
      ]);
    }) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-old-test", cacheRetention: "24h", fetch: fakeFetch });
    const events: StepEvent[] = [];
    for await (const e of provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [] }).step()) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: "step_done", text: "ok" });
    for await (const _ of provider.startTurn({ system: "S", history: [{ type: "user", text: "hi" }], tools: [] }).step()) void _;
    expect(requests.map((r) => "prompt_cache_retention" in r)).toEqual([true, false, false]); // asked once, then left out
  });

  it("raises API errors so the agent can report them", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-bad", model: "gpt-5.5", fetch: fakeFetch });
    const turn = provider.startTurn({ system: "", history: [{ type: "user", text: "hi" }], tools: [] });
    await expect(async () => {
      for await (const _ of turn.step()) void _;
    }).rejects.toMatchObject({ status: 401 });
  });
});
