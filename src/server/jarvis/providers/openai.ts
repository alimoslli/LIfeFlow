import OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem, Tool } from "openai/resources/responses/responses";
import type { ChatItem, ModelProvider, ModelTurn, StepEvent, ToolCall } from "./types";
import { ProviderUnavailableError } from "./types";
import type { ToolSpec } from "../registry";

export type OpenAIConfig = {
  apiKey: string;
  model: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  baseURL?: string;
  /** Injected in tests to simulate the API. */
  fetch?: typeof fetch;
};

/** Reasoning-capable model families need encrypted reasoning items replayed when store=false. */
const isReasoningModel = (model: string) => /^(gpt-5|o\d)/.test(model) && !/chat-latest/.test(model);

export function toResponsesInput(history: ChatItem[]): ResponseInputItem[] {
  return history.map((item): ResponseInputItem => {
    switch (item.type) {
      case "user":
        return {
          role: "user",
          content: [
            { type: "input_text", text: item.text || "(no text)" },
            ...(item.images ?? []).map((img) => ({ type: "input_image" as const, detail: "auto" as const, image_url: `data:${img.mimeType};base64,${img.base64}` })),
          ],
        };
      case "assistant":
        return { role: "assistant", content: item.text };
      case "tool_call":
        return { type: "function_call", call_id: item.callId, name: item.name, arguments: item.arguments };
      case "tool_result":
        return { type: "function_call_output", call_id: item.callId, output: item.output };
    }
  });
}

/**
 * OpenAI Responses API provider. Uses store:false so conversation content is
 * not retained server-side by OpenAI's response storage; our database is the
 * source of truth and history is replayed each turn.
 */
export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(private config: OpenAIConfig) {
    if (!config.apiKey) throw new ProviderUnavailableError("OPENAI_API_KEY is not configured.");
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 2, timeout: 120_000, fetch: config.fetch });
  }

  startTurn({ system, history, tools }: { system: string; history: ChatItem[]; tools: ToolSpec[] }): ModelTurn {
    const input: ResponseInputItem[] = toResponsesInput(history);
    const toolDefs: Tool[] = tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false }));
    const { client, config } = this;
    const reasoning = isReasoningModel(config.model);

    return {
      async *step(toolResults) {
        for (const r of toolResults ?? []) input.push({ type: "function_call_output", call_id: r.callId, output: r.output });
        const stream = await client.responses.create({
          model: config.model,
          instructions: system,
          input,
          tools: toolDefs,
          parallel_tool_calls: true,
          store: false,
          stream: true,
          ...(reasoning && { include: ["reasoning.encrypted_content"] }),
          ...(reasoning && config.reasoningEffort && { reasoning: { effort: config.reasoningEffort } }),
        });
        let text = "";
        let output: ResponseOutputItem[] | null = null;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            text += event.delta;
            yield { type: "text_delta", delta: event.delta } satisfies StepEvent;
          } else if (event.type === "response.completed" || event.type === "response.incomplete") {
            output = event.response.output;
          } else if (event.type === "response.failed") {
            throw new Error(event.response.error?.message ?? "The model request failed.");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
        if (!output) throw new Error("The model stream ended without a response.");
        const toolCalls: ToolCall[] = [];
        for (const item of output) {
          if (item.type === "function_call") toolCalls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
          // Replay this step's items so the next step keeps its reasoning context.
          if (item.type === "reasoning" && !item.encrypted_content) continue;
          input.push(item as ResponseInputItem);
        }
        yield { type: "step_done", text, toolCalls };
      },
    };
  }
}
