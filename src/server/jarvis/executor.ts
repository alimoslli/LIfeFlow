import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { pendingActions, type ToolResultRecord } from "../db/schema";
import { audit } from "../services/audit";
import { ServiceError } from "../services/errors";
import { getTool } from "./registry";
import type { ToolContext } from "./tool";

export const MAX_TOOL_RESULT_CHARS = 24_000;
const CONFIRM_TTL_MS = 30 * 60_000;

export type ExecOutcome =
  | { kind: "result"; result: ToolResultRecord }
  | { kind: "confirmation"; result: ToolResultRecord; pendingActionId: string; summary: string };

function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`;
  if (e instanceof ServiceError) return e.message;
  if (e instanceof Error && !/Failed query|duplicate key|violates/.test(e.message)) return e.message;
  return "The operation failed due to an internal error.";
}

/** Serializes a result for the model, truncating oversized payloads. */
export function serializeResult(r: ToolResultRecord): string {
  const s = JSON.stringify(r);
  return s.length <= MAX_TOOL_RESULT_CHARS ? s : JSON.stringify({ ...r, data: undefined, truncated: true, preview: s.slice(0, MAX_TOOL_RESULT_CHARS) });
}

/**
 * Validates and runs a tool call on behalf of the model. The model never
 * touches the database directly: every tool runs through a user-scoped,
 * RLS-enforced transaction built from the server-side session, regardless of
 * what ids the model supplies.
 */
export async function executeToolCall(name: string, rawArgs: string, ctx: ToolContext, callId: string): Promise<ExecOutcome> {
  const tool = getTool(name);
  if (!tool) return { kind: "result", result: { ok: false, error: `Unknown tool "${name}"` } };
  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { kind: "result", result: { ok: false, error: "Arguments were not valid JSON." } };
  }
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) return { kind: "result", result: { ok: false, error: errorMessage(parsed.error) } };

  if (tool.confirm) {
    try {
      const summary = await tool.confirm(parsed.data, ctx);
      const [row] = await ctx.run(({ tx, userId }) =>
        tx
          .insert(pendingActions)
          .values({ userId, conversationId: ctx.conversationId, toolName: name, toolCallId: callId, args: parsed.data as Record<string, unknown>, summary, expiresAt: new Date(Date.now() + CONFIRM_TTL_MS) })
          .returning(),
      );
      return {
        kind: "confirmation",
        pendingActionId: row.id,
        summary,
        result: { ok: false, data: { status: "awaiting_user_confirmation", summary, note: "Not done yet. The user must press Confirm in the chat. Do not say it is done." } },
      };
    } catch (e) {
      return { kind: "result", result: { ok: false, error: errorMessage(e) } };
    }
  }
  return { kind: "result", result: await runTool(name, parsed.data, ctx) };
}

async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResultRecord> {
  const tool = getTool(name)!;
  try {
    const data = await tool.execute(args, ctx);
    if (tool.mutates) {
      await ctx.run((s) => audit(s, "jarvis", `tool.${name}`, { type: "conversation", id: ctx.conversationId }, { argKeys: Object.keys(args as object) }));
    }
    return { ok: true, data };
  } catch (e) {
    if (!(e instanceof ServiceError) && !(e instanceof ZodError)) console.error(`[jarvis] tool ${name} failed`, e);
    return { ok: false, error: errorMessage(e) };
  }
}

/** Executes or cancels a pending action after the user's explicit decision. */
export async function resolvePendingAction(id: string, decision: "confirm" | "cancel", ctx: ToolContext) {
  const [action] = await ctx.run(({ tx, userId }) => tx.select().from(pendingActions).where(and(eq(pendingActions.id, id), eq(pendingActions.userId, userId))));
  if (!action) throw new ServiceError("Action not found", "not_found");
  if (action.status !== "pending") throw new ServiceError(`This action was already ${action.status}.`, "conflict");
  const expired = action.expiresAt < new Date();
  let status: "executed" | "cancelled" | "failed" | "expired";
  let result: ToolResultRecord;
  if (expired) {
    status = "expired";
    result = { ok: false, error: "Confirmation expired; nothing was changed." };
  } else if (decision === "cancel") {
    status = "cancelled";
    result = { ok: false, error: "The user cancelled this action; nothing was changed." };
  } else {
    result = await runTool(action.toolName, action.args, { ...ctx, conversationId: action.conversationId });
    status = result.ok ? "executed" : "failed";
  }
  await ctx.run(({ tx }) => tx.update(pendingActions).set({ status, result, resolvedAt: new Date() }).where(eq(pendingActions.id, id)));
  return { action, status, result };
}
