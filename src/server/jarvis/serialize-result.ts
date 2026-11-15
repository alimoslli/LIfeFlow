import type { ToolResultRecord } from "../db/schema";

/** The most of one tool result the model is sent, live and when the conversation is replayed on a later turn. */
export const MAX_TOOL_RESULT_CHARS = 24_000;

/** Serializes a result for the model, truncating oversized payloads. */
export function serializeResult(r: ToolResultRecord): string {
  const s = JSON.stringify(r);
  return s.length <= MAX_TOOL_RESULT_CHARS ? s : JSON.stringify({ ...r, data: undefined, truncated: true, preview: s.slice(0, MAX_TOOL_RESULT_CHARS) });
}
