import { env } from "../env";
import { estimateCostMicros, type ModelPrices } from "../jarvis/metrics";
import type { TokenUsage } from "../jarvis/providers/types";
import { modelPrices, smallModelPrices } from "../jarvis/providers";

/**
 * Prices come only from settings (JARVIS_PRICE_*), never from code (ADR 0035). Unknown stays unknown: no price, a price copied
 * for a different model, or no reported usage all give null, never 0.
 */

export type Priced = { costMicros: number | null; priceKey: string | null };

/**
 * The price set that belongs to `model`: the one whose `forModel` is that model. Prices without a model name
 * (callers that pass plain numbers, like tests) are used as the old code did: main prices unless the model differs from the provider's own.
 */
export function pickPrices(model: string | null | undefined, main?: ModelPrices, small?: ModelPrices, providerModel?: string): ModelPrices | null {
  if (!model) return null;
  if (main?.forModel || small?.forModel) {
    if (main?.forModel === model) return main;
    if (small?.forModel === model) return small;
    return null;
  }
  return providerModel && model !== providerModel ? (small ?? null) : (main ?? null);
}

/** What this usage cost with this model's configured prices, and which price set was used. */
export function priceTokens(
  model: string | null | undefined,
  usage: TokenUsage | null,
  main?: ModelPrices,
  small?: ModelPrices,
  providerModel?: string,
): Priced {
  const set = pickPrices(model, main, small, providerModel);
  const costMicros = set ? estimateCostMicros(usage, set) : null;
  return { costMicros, priceKey: costMicros == null ? null : (set?.forModel ?? model ?? null) };
}

/** The same, with prices read from settings (documents, tidying, search). */
export function priceFromSettings(model: string | null | undefined, usage: TokenUsage | null): Priced {
  return priceTokens(model, usage, modelPrices(), smallModelPrices(), env().OPENAI_MODEL);
}

/** The provider's fee for one web search, in millionths of a dollar; null when the fee isn't configured. */
export function webSearchFeeMicros(e = env()): number | null {
  const per1k = e.JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS;
  return per1k == null ? null : Math.round(per1k * 1000);
}

/** A search's cost: its tokens plus the per-search fee. Unknown unless both are priced. */
export function priceSearch(model: string | null | undefined, usage: TokenUsage | null, searchCalls: number): Priced {
  const tokens = priceFromSettings(model, usage);
  const fee = webSearchFeeMicros();
  if (tokens.costMicros == null || fee == null) return { costMicros: null, priceKey: null };
  return { costMicros: tokens.costMicros + fee * searchCalls, priceKey: tokens.priceKey };
}

export type PriceCoverage = { dollarsCounting: boolean; unpriced: string[] };

/**
 * Which kinds of paid work have a configured price, for the admin AI panel. The dollar limits and ceilings count only priced work;
 * the rest is held by counted limits. Voice has no price setting at all, so it is always listed.
 */
export function priceCoverage(e = env()): PriceCoverage {
  const set = (i?: number, o?: number) => i != null && o != null;
  const main = set(e.JARVIS_PRICE_INPUT_PER_MTOK, e.JARVIS_PRICE_OUTPUT_PER_MTOK);
  const small = set(e.JARVIS_PRICE_SMALL_INPUT_PER_MTOK, e.JARVIS_PRICE_SMALL_OUTPUT_PER_MTOK);
  const searchModel = e.OPENAI_SEARCH_MODEL ?? e.OPENAI_MODEL;
  const searchTokens = searchModel === e.OPENAI_MODEL ? main : searchModel === e.OPENAI_MODEL_SMALL ? small : false;
  const unpriced: string[] = [];
  if (!main) unpriced.push("Chat and texts (main model)", "Reading documents");
  if (!small) unpriced.push("Quick chat turns and tidying transactions (small model)");
  if (!searchTokens || e.JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS == null) unpriced.push("Web search");
  unpriced.push("Voice");
  return { dollarsCounting: main || small, unpriced };
}
