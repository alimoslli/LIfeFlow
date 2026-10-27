import type { ToolSpec } from "../registry";

/** Provider-neutral conversation items (what we persist and replay). */
export type ChatItem =
  | { type: "user"; text: string; images?: { mimeType: string; base64: string }[] }
  | { type: "assistant"; text: string }
  | { type: "tool_call"; callId: string; name: string; arguments: string }
  | { type: "tool_result"; callId: string; output: string };

export type ToolCall = { callId: string; name: string; arguments: string };

export type StepEvent = { type: "text_delta"; delta: string } | { type: "step_done"; text: string; toolCalls: ToolCall[] };

/** One user turn: the agent calls step() until no tool calls remain. */
export interface ModelTurn {
  step(toolResults?: { callId: string; output: string }[]): AsyncGenerator<StepEvent>;
}

export interface ModelProvider {
  readonly name: string;
  startTurn(input: { system: string; history: ChatItem[]; tools: ToolSpec[] }): ModelTurn;
}

export class ProviderUnavailableError extends Error {}
