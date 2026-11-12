import type { ChatItem } from "./providers/types";

/**
 * Cost (docs/backlog/2026-11-12-long-chat-trim.md): in a long chat every earlier tool call and result was sent again on every
 * step, and each one kept its tool group on the list, so the ninth question of a day carried 80 tools instead of 15.
 * Earlier turns keep their words (the user's messages and the skyling's answers); only the last finished turn and the
 * current one keep their tool steps, so a follow-up ("ok, book the second one") still sees what was just looked up.
 */
export function keepRecentToolSteps(history: ChatItem[], turnsWithTools = 2): ChatItem[] {
  const users = history.flatMap((h, i) => (h.type === "user" ? [i] : []));
  if (users.length <= turnsWithTools) return history;
  const from = users[users.length - turnsWithTools];
  return history.filter((h, i) => i >= from || (h.type !== "tool_call" && h.type !== "tool_result"));
}
