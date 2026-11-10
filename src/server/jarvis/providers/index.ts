import { env } from "../../env";
import type { ModelPrices } from "../metrics";
import { OpenAIProvider } from "./openai";
import { ProviderUnavailableError, type ModelProvider } from "./types";

export type JarvisStatus = { available: boolean; provider: string; model: string | null; reason?: string };

export function jarvisStatus(): JarvisStatus {
  const e = env();
  if (!e.OPENAI_API_KEY) return { available: false, provider: "openai", model: e.OPENAI_MODEL, reason: "Your skyling isn't available right now." };
  return { available: true, provider: "openai", model: e.OPENAI_MODEL };
}

export function modelPrices(): ModelPrices {
  const e = env();
  return {
    inputPerMTok: e.JARVIS_PRICE_INPUT_PER_MTOK,
    cachedInputPerMTok: e.JARVIS_PRICE_CACHED_INPUT_PER_MTOK,
    outputPerMTok: e.JARVIS_PRICE_OUTPUT_PER_MTOK,
  };
}

/** Prices of the small model (OPENAI_MODEL_SMALL), for turns it answered. */
export function smallModelPrices(): ModelPrices {
  const e = env();
  return {
    inputPerMTok: e.JARVIS_PRICE_SMALL_INPUT_PER_MTOK,
    cachedInputPerMTok: e.JARVIS_PRICE_SMALL_CACHED_INPUT_PER_MTOK,
    outputPerMTok: e.JARVIS_PRICE_SMALL_OUTPUT_PER_MTOK,
  };
}

export function getProvider(): ModelProvider {
  const e = env();
  // For the server log only; people see "isn't available right now" (chat route).
  if (!e.OPENAI_API_KEY) throw new ProviderUnavailableError("No AI provider configured: OPENAI_API_KEY is not set.");
  return new OpenAIProvider({
    apiKey: e.OPENAI_API_KEY,
    model: e.OPENAI_MODEL,
    smallModel: e.OPENAI_MODEL_SMALL || undefined,
    reasoningEffort: e.OPENAI_REASONING_EFFORT ?? "auto",
    cacheRetention: e.OPENAI_PROMPT_CACHE_RETENTION ?? "24h",
    baseURL: e.OPENAI_BASE_URL,
  });
}
