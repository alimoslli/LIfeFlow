import { financeTools } from "./tools/finance";
import { moneyCoachTools } from "./tools/money-coach";
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
  { kind: "result"; result: ToolResultRecord } | { kind: "confirmation"; result: ToolResultRecord; pendingActionId: string; summary: string };

/** Said when a tool fails for a reason we didn't word ourselves (the details are in the server log). */
export const TOOL_FAILED = "That didn't work this time. Try again in a minute.";

/**
 * What the model and the chat see when a tool fails. Only messages we wrote for people (ServiceError) pass
 * through; anything else (a provider's raw error, a database error) could name keys or settings, so it doesn't.
 */
function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`;
  if (e instanceof ServiceError) return e.message;
  return TOOL_FAILED;
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
const MONEY_TOOLS = new Set([...financeTools, ...moneyCoachTools].map((t) => t.name));

export async function executeToolCall(name: string, rawArgs: string, ctx: ToolContext, callId: string): Promise<ExecOutcome> {
  const tool = getTool(name);
  if (!tool) return { kind: "result", result: { ok: false, error: `Unknown tool "${name}"` } };
  if (ctx.moneyLocked && MONEY_TOOLS.has(name))
    return {
      kind: "result",
      result: { ok: false, error: "Money is locked with Face ID on this device. Tell the user to open the Money tab and unlock it, then ask again." },
    };
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
          .values({
            userId,
            conversationId: ctx.conversationId,
            toolName: name,
            toolCallId: callId,
            args: parsed.data as Record<string, unknown>,
            summary,
            expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
          })
          .returning(),
      );
      return {
        kind: "confirmation",
        pendingActionId: row.id,
        summary,
        result: {
          ok: false,
          data: { status: "awaiting_user_confirmation", summary, note: "Not done yet. The user must press Confirm in the chat. Do not say it is done." },
        },
      };
    } catch (e) {
      if (!(e instanceof ServiceError)) console.error(`[jarvis] tool ${name} confirm failed`, e);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executes or cancels a pending action after the user's explicit decision.
 * Idempotent: the action is claimed atomically (pending -> running), so only the first call runs it.
 * A second call (double tap, two devices, a retried request) waits for the first and gets its saved
 * result back with `replayed: true`; nothing runs twice.
 */
export async function resolvePendingAction(id: string, decision: "confirm" | "cancel", ctx: ToolContext) {
  const [peek] = await ctx.run(({ tx, userId }) =>
    tx
      .select()
      .from(pendingActions)
      .where(and(eq(pendingActions.id, id), eq(pendingActions.userId, userId))),
  );
  if (!peek) throw new ServiceError("Action not found", "not_found");
  if (decision === "confirm" && peek.status === "pending" && ctx.moneyLocked && MONEY_TOOLS.has(peek.toolName)) {
    throw new ServiceError("Money is locked. Unlock it in the Money tab with Face ID, then confirm again.", "forbidden");
  }
  // The claim: only one caller gets a row back.
  const [claimed] = await ctx.run(({ tx, userId }) =>
    tx
      .update(pendingActions)
      .set({ status: "running" })
      .where(and(eq(pendingActions.id, id), eq(pendingActions.userId, userId), eq(pendingActions.status, "pending")))
      .returning(),
  );
  if (!claimed) return await replayFinished(id, ctx);

  const action = claimed;
  let status: "executed" | "cancelled" | "failed" | "expired";
  let result: ToolResultRecord;
  if (action.expiresAt < new Date()) {
    status = "expired";
    result = { ok: false, error: "Confirmation expired; nothing was changed." };
  } else if (decision === "cancel") {
    status = "cancelled";
    result = { ok: false, error: "The user cancelled this action; nothing was changed." };
  } else {
    try {
      result = await runTool(action.toolName, action.args, { ...ctx, conversationId: action.conversationId });
    } catch (e) {
      console.error(`[jarvis] pending action ${id} crashed`, e);
      result = { ok: false, error: errorMessage(e) };
    }
    status = result.ok ? "executed" : "failed";
  }
  await ctx.run(({ tx }) => tx.update(pendingActions).set({ status, result, resolvedAt: new Date() }).where(eq(pendingActions.id, id)));
  return { action, status, result, replayed: false };
}

/** Someone else claimed the action: wait for them to finish, then return what they saved. */
async function replayFinished(id: string, ctx: ToolContext) {
  for (let i = 0; i < 300; i++) {
    const [row] = await ctx.run(({ tx, userId }) =>
      tx
        .select()
        .from(pendingActions)
        .where(and(eq(pendingActions.id, id), eq(pendingActions.userId, userId))),
    );
    if (!row) throw new ServiceError("Action not found", "not_found");
    if (row.status !== "pending" && row.status !== "running") {
      return {
        action: row,
        status: row.status as "executed" | "cancelled" | "failed" | "expired",
        result: row.result ?? { ok: false, error: "No result was saved." },
        replayed: true,
      };
    }
    await sleep(100);
  }
  throw new ServiceError("This action is still being processed. Check back in a moment.", "conflict");
}
