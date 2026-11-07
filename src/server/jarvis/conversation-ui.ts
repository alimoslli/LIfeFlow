import type { UiMessage } from "@/components/jarvis/types";
import type { UserScope } from "../db/with-user";
import { memoryStatuses } from "../services/memory";
import { attachmentMeta, getConversation, listMessages, listPendingActions } from "./conversations";
import { turnStateOf, type TurnState } from "./turn-state";
import { suggestedMemoryIds, toUiMessages } from "./ui-messages";

/**
 * The saved conversation of one send, found by the id the app made for it, plus where that send's turn stands.
 * The chat reads this to recover an answer after its connection dropped. Same-user only (RLS and the owner check).
 */
export async function snapshotForSend(
  scope: UserScope,
  clientMessageId: string,
): Promise<{ state: TurnState; conversationId: string | null; title: string; messages: UiMessage[] }> {
  const t = await turnStateOf(scope, clientMessageId);
  if (!t.conversationId) return { state: "unknown", conversationId: null, title: "", messages: [] };
  const conv = await getConversation(scope, t.conversationId);
  const rows = await listMessages(scope, conv.id);
  const actions = await listPendingActions(scope, conv.id);
  const atts = await attachmentMeta(scope, [...new Set(rows.flatMap((r) => r.attachmentIds))]);
  const statuses = await memoryStatuses(scope, suggestedMemoryIds(rows));
  return { state: t.state, conversationId: conv.id, title: conv.title, messages: toUiMessages(rows, actions, atts, statuses) };
}
