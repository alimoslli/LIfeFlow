import { z } from "zod";
import type { UserScope } from "../db/with-user";

export type ToolContext = {
  userId: string;
  tz: string;
  /** YYYY-MM-DD in the user's time zone. */
  today: string;
  now: Date;
  conversationId: string;
  /**
   * The user's own message for this turn. Used to check explicit requests
   * (e.g. "remember…") server-side instead of trusting the model's claim.
   */
  userText: string;
  /** The user's "let Jarvis suggest memories" setting. */
  memorySuggestions: boolean;
  /** Runs `fn` inside an RLS-scoped transaction for this user. */
  run: <T>(fn: (scope: UserScope) => Promise<T>) => Promise<T>;
};

export type ToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  /** Data-changing tools are audited. */
  mutates: boolean;
  /**
   * When set, the call is NOT executed immediately. A pending action is
   * stored and the user must press Confirm. Returns the summary shown to them.
   */
  confirm?: (args: z.infer<S>, ctx: ToolContext) => Promise<string> | string;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

// Shared argument fragments --------------------------------------------------

export const dateArg = (desc = "Local date, YYYY-MM-DD") =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(desc);
export const timeArg = (desc = "Local 24h time, HH:mm") =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .describe(desc);
export const idArg = (what: string) => z.string().uuid().describe(`${what} id (from a previous tool result)`);
export const moneyArg = (desc: string) => z.number().describe(`${desc}, in dollars (e.g. 12.5)`);

/** Dollars from the model → integer cents. */
export const toCents = (dollars: number) => Math.round(dollars * 100);
/** Integer cents → dollars for the model. */
export const toDollars = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100);
