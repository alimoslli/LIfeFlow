import { env } from "../env";
import { estimateCostMicros } from "../jarvis/metrics";
import type { ChatItem } from "../jarvis/providers/types";
import { priceFromSettings, webSearchFeeMicros } from "./ai-prices";

/**
 * Upper estimates of what one piece of paid work could cost, set aside before it starts (ADR 0035). The token bounds below are
 * engineering limits of ours (not prices); every estimate is null unless the configured prices cover the model, so an
 * unpriced feature is held to its counted limits only and cost is never invented.
 */

/** The most one model step may write (also sent to the model as its own output cap, so the estimate is a real bound). */
export const STEP_OUTPUT_TOKEN_CAP = 8_000;
/** An image or file in a message counts as this many input tokens for the estimate; the real usage settles it afterwards. */
const TOKENS_PER_ATTACHMENT = 8_000;
const CHARS_PER_TOKEN = 3;

const SEARCH = { inputTokens: 30_000, outputTokens: 4_000, calls: 5 } as const;
const DOCUMENT = { outputTokens: 4_000, tokensPerFile: 10_000, maxTextChars: 40_000 } as const;
const TIDY = { inputTokens: 6_000, outputTokens: 3_000 } as const;

/** Characters a conversation sends to the model: the instructions, the history and the tool results so far. */
export function inputChars(system: string, history: ChatItem[], extra = 0): { chars: number; attachments: number } {
  let chars = system.length + extra;
  let attachments = 0;
  for (const h of history) {
    if (h.type === "user") {
      chars += h.text.length;
      attachments += (h.images?.length ?? 0) + (h.files?.length ?? 0);
    } else if (h.type === "assistant") chars += h.text.length;
    else if (h.type === "tool_call") chars += h.name.length + h.arguments.length;
    else chars += h.output.length;
  }
  return { chars, attachments };
}

const tokensOf = (chars: number, attachments: number, perAttachment = TOKENS_PER_ATTACHMENT) =>
  Math.ceil(chars / CHARS_PER_TOKEN) + attachments * perAttachment;

type Prices = Parameters<typeof estimateCostMicros>[1];

function micros(model: string | null | undefined, inputTokens: number, outputTokens: number, prices?: Prices): number | null {
  const priced = prices
    ? estimateCostMicros({ inputTokens, cachedInputTokens: 0, outputTokens, reasoningTokens: 0 }, prices)
    : priceFromSettings(model, { inputTokens, cachedInputTokens: 0, outputTokens, reasoningTokens: 0 }).costMicros;
  return priced;
}

/** One chat or text step. `prices` is the set for the model that will answer (already matched to it), or null when unknown. */
export function chatStepEstimate(prices: Prices | null | undefined, chars: number, attachments: number): number | null {
  if (!prices) return null;
  return estimateCostMicros(
    { inputTokens: tokensOf(chars, attachments), cachedInputTokens: 0, outputTokens: STEP_OUTPUT_TOKEN_CAP, reasoningTokens: 0 },
    prices,
  );
}

/** One web search, with the per-search fee. Null unless both the model's prices and the fee are configured. */
export function searchEstimate(model: string | null | undefined): number | null {
  const fee = webSearchFeeMicros(env());
  const tokens = micros(model, SEARCH.inputTokens, SEARCH.outputTokens);
  return fee == null || tokens == null ? null : tokens + fee * SEARCH.calls;
}

/** Reading one document: its text (up to the limit we send) and its files. */
export function documentEstimate(model: string | null | undefined, textChars: number, files: number): number | null {
  const chars = Math.min(textChars, DOCUMENT.maxTextChars) + 2_000;
  return micros(model, tokensOf(chars, files, DOCUMENT.tokensPerFile), DOCUMENT.outputTokens);
}

/** One batch of up to 40 vendor lines. */
export function tidyEstimate(model: string | null | undefined): number | null {
  return micros(model, TIDY.inputTokens, TIDY.outputTokens);
}
