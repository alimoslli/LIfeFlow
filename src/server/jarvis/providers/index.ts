import { env } from "../../env";
import { OpenAIProvider } from "./openai";
import { ProviderUnavailableError, type ModelProvider } from "./types";

export type JarvisStatus = { available: boolean; provider: string; model: string | null; reason?: string };

export function jarvisStatus(): JarvisStatus {
  const e = env();
  if (!e.OPENAI_API_KEY) return { available: false, provider: "openai", model: e.OPENAI_MODEL, reason: "OPENAI_API_KEY is not set on the server." };
  return { available: true, provider: "openai", model: e.OPENAI_MODEL };
}

export function getProvider(): ModelProvider {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new ProviderUnavailableError("Jarvis isn't configured yet: add OPENAI_API_KEY to the server environment.");
  return new OpenAIProvider({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL, reasoningEffort: e.OPENAI_REASONING_EFFORT, baseURL: e.OPENAI_BASE_URL });
}
