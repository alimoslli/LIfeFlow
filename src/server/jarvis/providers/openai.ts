import OpenAI from "openai";
import type { ResponseCreateParamsStreaming, ResponseInputItem, ResponseOutputItem, Tool } from "openai/resources/responses/responses";
import type { ChatItem, ModelProvider, ModelTurn, ReplyVerbosity, StepEvent, TokenUsage, ToolCall, TurnEffort } from "./types";
import { ProviderUnavailableError } from "./types";
import type { ToolSpec } from "../registry";

export type OpenAIConfig = {
  apiKey: string;
  model: string;
  /** A cheaper model for "low" turns (lookups and adds); everything else stays on `model`. */
  smallModel?: string;
  /** A fixed level, or "auto" (the default): each turn picks low, medium or high (effort.ts). */
  reasoningEffort?: "auto" | "none" | "minimal" | "low" | "medium" | "high";
  /** How long OpenAI keeps the cached prompt start. "24h" where the model supports it. */
  cacheRetention?: "in_memory" | "24h";
  baseURL?: string;
  /** Injected in tests to simulate the API. */
  fetch?: typeof fetch;
};

/** Models that refused prompt_cache_retention: asked once, then left out. */
const noRetention = new Set<string>();
/** Small models that refused our request this run: their turns go to the main model (see startTurn). */
const smallRefused = new Set<string>();
const refusedRetention = (e: unknown) => e instanceof OpenAI.APIError && e.status === 400 && /prompt_cache_retention/.test(e.message);

const toToolDefs = (tools: ToolSpec[]): Tool[] =>
  tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false }));

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
            ...(item.images ?? []).map((img) => ({
              type: "input_image" as const,
              detail: "auto" as const,
              image_url: `data:${img.mimeType};base64,${img.base64}`,
            })),
            ...(item.files ?? []).map((f) => ({
              type: "input_file" as const,
              filename: f.filename,
              file_data: `data:${f.mimeType};base64,${f.base64}`,
            })),
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

type ResponsesUsage =
  | {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number } | null;
      output_tokens_details?: { reasoning_tokens?: number } | null;
    }
  | null
  | undefined;

/** Normalizes Responses API usage; undefined when the server didn't report it. */
export function toUsage(u: ResponsesUsage): TokenUsage | undefined {
  if (!u || typeof u.input_tokens !== "number") return undefined;
  return {
    inputTokens: u.input_tokens,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

/**
 * OpenAI Responses API provider. Uses store:false so conversation content is
 * not retained server-side by OpenAI's response storage; our database is the
 * source of truth and history is replayed each turn.
 */
export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  readonly model: string;
  private client: OpenAI;

  constructor(private config: OpenAIConfig) {
    if (!config.apiKey) throw new ProviderUnavailableError("OPENAI_API_KEY is not configured.");
    this.model = config.model;
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 2, timeout: 120_000, fetch: config.fetch });
  }

  startTurn({
    system,
    history,
    tools,
    cacheKey,
    effort,
    verbosity,
    signal,
  }: {
    system: string;
    history: ChatItem[];
    tools: ToolSpec[];
    cacheKey?: string;
    effort?: TurnEffort;
    verbosity?: ReplyVerbosity;
    signal?: AbortSignal;
  }): ModelTurn {
    const input: ResponseInputItem[] = toResponsesInput(history);
    let toolDefs = toToolDefs(tools);
    const { client, config } = this;
    // small things on the small model (owner, 2026-11-10); one model for the whole turn, so its cache holds. A small
    // model that refuses our request (unknown model, a setting it doesn't take) is set aside and the main one answers.
    const small = effort === "low" && config.smallModel && !smallRefused.has(config.smallModel) ? config.smallModel : undefined;
    let model = small ?? config.model;
    const fixed = config.reasoningEffort && config.reasoningEffort !== "auto" ? config.reasoningEffort : undefined;
    const reasoningEffort = fixed ?? effort;
    let first = true;

    const bodyFor = (model: string): ResponseCreateParamsStreaming => {
      const reasoning = isReasoningModel(model);
      return {
        model,
        instructions: system,
        input,
        tools: toolDefs,
        parallel_tool_calls: true,
        store: false,
        stream: true,
        ...(cacheKey && { prompt_cache_key: cacheKey }),
        ...(reasoning && { include: ["reasoning.encrypted_content"] }),
        ...(reasoning && reasoningEffort && { reasoning: { effort: reasoningEffort } }),
        // GPT-5 family: the model's own answer-length setting. A prompt rule alone left week plans at 800+ words.
        ...(reasoning && verbosity && { text: { verbosity } }),
      };
    };
    const send = async (model: string) => {
      const body = bodyFor(model);
      const retention = config.cacheRetention && !noRetention.has(model) ? config.cacheRetention : undefined;
      try {
        return await client.responses.create(retention ? { ...body, prompt_cache_retention: retention } : body, { signal });
      } catch (e) {
        if (!retention || !refusedRetention(e)) throw e;
        noRetention.add(model);
        return client.responses.create(body, { signal });
      }
    };

    return {
      get model() {
        return model;
      },
      async *step(toolResults, nextTools) {
        for (const r of toolResults ?? []) input.push({ type: "function_call_output", call_id: r.callId, output: r.output });
        if (nextTools) toolDefs = toToolDefs(nextTools);
        let stream;
        try {
          stream = await send(model);
        } catch (e) {
          // only before the small model has said anything in this turn: later steps carry its own reasoning items
          const status = (e as { status?: number })?.status;
          if (!(first && small && model === small && (status === 400 || status === 404))) throw e;
          smallRefused.add(small);
          model = config.model;
          stream = await send(model);
        }
        first = false;
        let text = "";
        let output: ResponseOutputItem[] | null = null;
        let usage: TokenUsage | undefined;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            text += event.delta;
            yield { type: "text_delta", delta: event.delta } satisfies StepEvent;
          } else if (event.type === "response.completed" || event.type === "response.incomplete") {
            output = event.response.output;
            usage = toUsage(event.response.usage);
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
        yield { type: "step_done", text, toolCalls, usage };
      },
    };
  }
}
