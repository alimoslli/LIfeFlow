import type { ToolResultRecord } from "../db/schema";

/** The most of one tool result the model is sent, live and when the conversation is replayed on a later turn. */
export const MAX_TOOL_RESULT_CHARS = 24_000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * A calendar date at the start of a tool value: "2026-11-04", "2026-11-04 23:59", or a local timestamp with its offset
 * ("2026-11-04T23:59:00-05:00"). Not a UTC timestamp ("...Z"): its weekday depends on the person's time zone, which this
 * layer doesn't know, so it is left alone rather than risk the wrong day.
 */
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[+-]\d{2}:?\d{2})?$)/;

/** The weekday of a tool value's local date, or null when it isn't one (owner, 2026-11-21: "the cheap fix"). */
export function weekdayOf(value: string): string | null {
  const m = LOCAL_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  // Reject impossible dates (2026-02-31 rolls over to March).
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return WEEKDAYS[t.getUTCDay()];
}

/**
 * Next to every field that holds a local date, adds `<field>Weekday` ("due": "2026-11-04 23:59" gets "dueWeekday": "Wed"),
 * so the model reads the day instead of working it out. Small models got weekdays wrong more than anything else on the
 * Jarvis eval (docs/research/2026-11-21-open-chat-model-eval.md). The date itself is never changed, so a date the model
 * copies back into a tool call stays valid. Only what the model is sent changes; the stored result stays as the tool made it.
 */
export function withWeekdays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withWeekdays);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  const src = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(src)) {
    out[k] = withWeekdays(v);
    const day = typeof v === "string" ? weekdayOf(v) : null;
    // Never overwrite a field the tool already sent.
    if (day && !(`${k}Weekday` in src)) out[`${k}Weekday`] = day;
  }
  return out;
}

/** Serializes a result for the model (with weekdays beside its dates), truncating oversized payloads. */
export function serializeResult(r: ToolResultRecord): string {
  const s = JSON.stringify(withWeekdays(r));
  return s.length <= MAX_TOOL_RESULT_CHARS ? s : JSON.stringify({ ...r, data: undefined, truncated: true, preview: s.slice(0, MAX_TOOL_RESULT_CHARS) });
}
