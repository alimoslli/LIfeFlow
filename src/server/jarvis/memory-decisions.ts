import { and, eq, inArray, sql } from "drizzle-orm";
import { messages } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { approveMemory, dismissMemory, getMemory } from "../services/memory";

export type MemoryDecision = "keep" | "dismiss";

/**
 * The user's Keep / Not now on a memory suggestion (from the chat card or
 * Settings). Also rewrites the suggestion's tool result in the transcript so
 * the model's next turn sees what the user actually decided.
 */
export async function decideMemorySuggestion(scope: UserScope, id: string, decision: MemoryDecision, now = new Date()) {
  const before = await getMemory(scope, id);
  const result = decision === "keep" ? await approveMemory(scope, id, now) : { memory: await dismissMemory(scope, id), replaced: null };
  if (before.conversationId) {
    const status = decision === "keep" ? "approved_by_user" : "dismissed_by_user";
    await scope.tx
      .update(messages)
      .set({ toolResult: sql`jsonb_set(${messages.toolResult}, '{data,status}', ${JSON.stringify(status)}::jsonb)` })
      .where(
        and(
          eq(messages.userId, scope.userId),
          eq(messages.conversationId, before.conversationId),
          inArray(messages.toolName, ["save_memory", "update_memory"]),
          sql`${messages.toolResult} -> 'data' -> 'memory' ->> 'id' = ${id}`,
        ),
      );
  }
  return result;
}
