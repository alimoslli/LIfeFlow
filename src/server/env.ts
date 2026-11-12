import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Import from server code only; the `server-only`
 * import makes the build fail if a client component pulls this in.
 */
const optionalNumber = z.coerce
  .number()
  .nonnegative()
  .optional()
  .or(z.literal("").transform(() => undefined));

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  /**
   * The cheaper model for small things (owner, 2026-11-10): turns whose thinking level is "low" (lookups and adds,
   * effort.ts). Planning, money decisions, clashes, files and anything unclear stay on OPENAI_MODEL. Empty turns it off.
   */
  OPENAI_MODEL_SMALL: z.string().default("gpt-5.4-mini"),
  /** Model for live web searches (Jarvis web_search, savings finder). Defaults to OPENAI_MODEL. */
  OPENAI_SEARCH_MODEL: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Live voice model (OpenAI Realtime). */
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  /** "auto" (default): each turn thinks low, medium or high depending on the request. Or one fixed level. */
  OPENAI_REASONING_EFFORT: z
    .enum(["auto", "none", "minimal", "low", "medium", "high"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** How long OpenAI keeps the cached start of Jarvis's prompt. Default "24h" (falls back to in-memory if the model refuses). */
  OPENAI_PROMPT_CACHE_RETENTION: z
    .enum(["in_memory", "24h"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Optional: OpenAI-compatible endpoint (proxy/gateway, or the e2e fake server). */
  OPENAI_BASE_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * Optional model prices in US dollars per 1M tokens, used only to estimate
   * cost in Jarvis metrics. Copy them from the provider's pricing page; when
   * unset, cost is reported as unknown rather than guessed.
   */
  JARVIS_PRICE_INPUT_PER_MTOK: optionalNumber,
  JARVIS_PRICE_CACHED_INPUT_PER_MTOK: optionalNumber,
  JARVIS_PRICE_OUTPUT_PER_MTOK: optionalNumber,
  /** Prices of OPENAI_MODEL_SMALL, so its turns are priced too (unknown ⇒ null, never invented). */
  JARVIS_PRICE_SMALL_INPUT_PER_MTOK: optionalNumber,
  JARVIS_PRICE_SMALL_CACHED_INPUT_PER_MTOK: optionalNumber,
  JARVIS_PRICE_SMALL_OUTPUT_PER_MTOK: optionalNumber,
  /**
   * The model each set of prices was copied for (ADR 0035). When the running model differs, its cost is unknown instead of
   * mispriced. Unset: the prices belong to OPENAI_MODEL / OPENAI_MODEL_SMALL as configured.
   */
  JARVIS_PRICE_MODEL: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  JARVIS_PRICE_SMALL_MODEL: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** The provider's fee in US dollars per 1,000 web searches. Unset: a search's cost is unknown (never guessed). */
  JARVIS_PRICE_WEB_SEARCH_PER_1K_CALLS: optionalNumber,
  /**
   * The company ceilings on paid AI (ADR 0035), in US dollars; they count only where a price is configured. Unset: the owner's
   * numbers for the 10-student test ($50 a month, $10 a day). Warnings at 50% and 80%; at 100% the skyling pauses for everyone but admins.
   */
  AI_GLOBAL_MONTH_DOLLARS: optionalNumber,
  AI_GLOBAL_DAY_DOLLARS: optionalNumber,
  /** Optional ceilings on the number of paid AI uses for the whole company (for features whose cost isn't priced). Unset: no count ceiling. */
  AI_GLOBAL_MONTH_CALLS: optionalNumber,
  AI_GLOBAL_DAY_CALLS: optionalNumber,
  /** A Pro person's monthly AI allowance in US dollars after paid plans turn on (decision 7). OFF until the owner picks a number: unset means no per-person dollar limit for Pro. */
  AI_PRO_MONTH_DOLLARS: optionalNumber,
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid server environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
