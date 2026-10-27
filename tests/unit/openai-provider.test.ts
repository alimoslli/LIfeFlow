import { describe, expect, it } from "vitest";
import { OpenAIProvider, toResponsesInput } from "@/server/jarvis/providers/openai";
import type { StepEvent } from "@/server/jarvis/providers/types";

/** Builds a fake Responses API SSE stream. */
function sse(events: Record<string, unknown>[]) {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const completed = (output: unknown[]) => ({ type: "response.completed", sequence_number: 9, response: { id: "resp_1", object: "response", status: "completed", output } });

describe("OpenAI Responses provider", () => {
  it("maps history to Responses input items", () => {
    const input = toResponsesInput([
      { type: "user", text: "hi", images: [{ mimeType: "image/png", base64: "AAAA" }] },
      { type: "assistant", text: "hello" },
      { type: "tool_call", callId: "c1", name: "list_tasks", arguments: "{}" },
      { type: "tool_result", callId: "c1", output: '{"ok":true}' },
    ]);
    expect(input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "hi" }, { type: "input_image", detail: "auto", image_url: "data:image/png;base64,AAAA" }] },
      { role: "assistant", content: "hello" },
      { type: "function_call", call_id: "c1", name: "list_tasks", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: '{"ok":true}' },
    ]);
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
        completed([{ type: "message", id: "m2", role: "assistant", status: "completed", content: [{ type: "output_text", text: "You have 2 tasks.", annotations: [] }] }]),
      ]);
    }) as unknown as typeof fetch;

    const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.5", reasoningEffort: "low", fetch: fakeFetch });
    const turn = provider.startTurn({ system: "SYS", history: [{ type: "user", text: "tasks?" }], tools: [{ name: "list_tasks", description: "d", parameters: { type: "object", properties: {} } }] });

    const step1: StepEvent[] = [];
    for await (const e of turn.step()) step1.push(e);
    expect(step1.filter((e) => e.type === "text_delta").map((e) => (e as { delta: string }).delta).join("")).toBe("Let me check.");
    expect(step1.at(-1)).toEqual({ type: "step_done", text: "Let me check.", toolCalls: [{ callId: "call_1", name: "list_tasks", arguments: '{"status":"open"}' }] });

    const step2: StepEvent[] = [];
    for await (const e of turn.step([{ callId: "call_1", output: '{"ok":true,"data":{"count":2}}' }])) step2.push(e);
    expect(step2.at(-1)).toMatchObject({ type: "step_done", text: "You have 2 tasks.", toolCalls: [] });

    const [r1, r2] = requests;
    expect(r1).toMatchObject({ model: "gpt-5.5", instructions: "SYS", store: false, stream: true, include: ["reasoning.encrypted_content"], reasoning: { effort: "low" } });
    expect((r1.tools as { name: string; type: string }[])[0]).toMatchObject({ type: "function", name: "list_tasks" });
    // Second request carries: original user msg, the 3 output items, then our function_call_output.
    const input2 = r2.input as { type?: string; role?: string }[];
    expect(input2.map((i) => i.type ?? i.role)).toEqual(["user", "reasoning", "message", "function_call", "function_call_output"]);
  });

  it("raises API errors so the agent can report them", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const provider = new OpenAIProvider({ apiKey: "sk-bad", model: "gpt-5.5", fetch: fakeFetch });
    const turn = provider.startTurn({ system: "", history: [{ type: "user", text: "hi" }], tools: [] });
    await expect(async () => {
      for await (const _ of turn.step()) void _;
    }).rejects.toMatchObject({ status: 401 });
  });
});
