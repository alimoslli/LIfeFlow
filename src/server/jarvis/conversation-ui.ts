import { and, desc, eq, gte } from "drizzle-orm";
import type { UiMessage } from "@/components/jarvis/types";
import { jarvisRuns, messages } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { memoryStatuses } from "../services/memory";
import { attachmentMeta, getConversation, listMessages, listPendingActions } from "./conversations";
import { suggestedMemoryIds, toUiMessages } from "./ui-messages";

/**
 * A conversation as the chat shows it, plus whether the latest turn has finished (its run row exists).
 * The chat reads this to recover an answer after its connection dropped. Same-user only (RLS and the owner check).
 */
export async function conversationSnapshot(
  scope: UserScope,
  conversationId: string,
): Promise<{ title: string; messages: UiMessage[]; finished: boolean } | null> {
  const conv = await getConversation(scope, conversationId).catch(() => null);
  if (!conv) return null;
  const rows = await listMessages(scope, conversationId);
  const actions = await listPendingActions(scope, conversationId);
  const atts = await attachmentMeta(scope, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
  const statuses = await memoryStatuses(scope, suggestedMemoryIds(rows));
  const [lastUser] = await scope.tx
    .select({ at: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, scope.userId), eq(messages.role, "user")))
    .orderBy(desc(messages.seq))
    .limit(1);
  let finished = false;
  if (lastUser) {
    const run = await scope.tx
      .select({ id: jarvisRuns.id })
      .from(jarvisRuns)
      .where(and(eq(jarvisRuns.conversationId, conversationId), eq(jarvisRuns.userId, scope.userId), gte(jarvisRuns.createdAt, lastUser.at)))
      .limit(1);
    finished = run.length > 0;
  }
  return { title: conv.title, messages: toUiMessages(rows, actions, atts, statuses), finished };
}
