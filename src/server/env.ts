import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Import from server code only; the `server-only`
 * import makes the build fail if a client component pulls this in.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  OPENAI_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high"]).optional().or(z.literal("").transform(() => undefined)),
  /** Optional: OpenAI-compatible endpoint (proxy/gateway, or the e2e fake server). */
  OPENAI_BASE_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
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
