import { and, eq } from "drizzle-orm";
import type { SessionUser } from "../auth/sessions";
import { messages } from "../db/schema";
import { withUser } from "../db/with-user";
import { audit } from "../services/audit";
import { makeToolContext } from "./agent";
import { resolvePendingAction } from "./executor";

/**
 * The user's explicit Confirm or Cancel on an action Jarvis proposed, from the app or a text reply.
 * Runs it (or not), keeps the transcript truthful for the next turn, and returns what to tell the user.
 */
export async function decidePendingAction(user: SessionUser, id: string, decision: "confirm" | "cancel", moneyLocked: boolean, via: "app" | "sms" = "app") {
  const toolCtx = makeToolContext(user, "00000000-0000-0000-0000-000000000000", new Date(), "", moneyLocked);
  const { action, status, result } = await resolvePendingAction(id, decision, toolCtx);
  const message =
    status === "executed"
      ? `Confirmed and done: ${action.summary.replace(/\?$/, "")}.`
      : status === "cancelled"
        ? "Cancelled. Nothing was changed."
        : (result.error ?? "Failed.");
  await withUser(user.id, async (s) => {
    await s.tx
      .update(messages)
      .set({
        toolResult: { ...result, data: { status, confirmedByUser: decision === "confirm", result: result.data } },
        status: result.ok ? "complete" : "error",
      })
      .where(and(eq(messages.conversationId, action.conversationId), eq(messages.toolCallId, action.toolCallId), eq(messages.userId, s.userId)));
    await s.tx.insert(messages).values({ userId: s.userId, conversationId: action.conversationId, role: "assistant", content: message });
    await audit(s, "user", `jarvis.action.${status}`, { type: "pending_action", id }, { tool: action.toolName, via });
  });
  return { status, message, ok: result.ok };
}
