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
  OPENAI_REASONING_EFFORT: z
    .enum(["none", "minimal", "low", "medium", "high"])
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
