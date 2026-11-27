import { and, eq, isNotNull } from "drizzle-orm";
import { jarvisRuns, type attachments, type messages, type pendingActions } from "../db/schema";
import type { UserScope } from "../db/with-user";
import type { UiMemorySuggestion, UiMessage, UiTool } from "@/components/jarvis/types";
import type { MemoryStatus } from "../db/schema";
import { describeToolCall, describeToolResult, memoryProposalOf } from "./labels";

type Msg = typeof messages.$inferSelect;
type Action = typeof pendingActions.$inferSelect;
type Att = Pick<typeof attachments.$inferSelect, "id" | "filename" | "mimeType">;

const SUGGESTION_STATUS: Record<MemoryStatus, UiMemorySuggestion["status"]> = {
  proposed: "proposed",
  active: "saved",
  archived: "saved",
  rejected: "dismissed",
};

/** Ids of memories suggested in these rows (to look up their current status). */
export function suggestedMemoryIds(rows: Msg[]): string[] {
  return rows
    .flatMap((m) => (m.role === "tool" && m.toolName ? [memoryProposalOf(m.toolName, m.toolResult ?? { ok: false })?.memoryId] : []))
    .filter((id): id is string => !!id);
}

/** The run of each answer, by its final message's id, so a chat loaded again keeps its 👍 / 👎 (see answerRuns). */
export type AnswerRuns = Map<string, { runId: string; rating: number | null }>;

/** The runs behind these answers (the user's own, row-level security), for toUiMessages. */
export async function answerRuns(scope: UserScope, conversationId: string): Promise<AnswerRuns> {
  const rows = await scope.tx
    .select({ id: jarvisRuns.id, messageId: jarvisRuns.messageId, rating: jarvisRuns.rating })
    .from(jarvisRuns)
    .where(and(eq(jarvisRuns.userId, scope.userId), eq(jarvisRuns.conversationId, conversationId), isNotNull(jarvisRuns.messageId)));
  return new Map(rows.map((r) => [r.messageId!, { runId: r.id, rating: r.rating }]));
}

/** Groups stored rows into chat bubbles: each user message, then one assistant bubble for its turn. */
export function toUiMessages(
  rows: Msg[],
  actions: Action[],
  atts: Att[],
  memoryStatus: Map<string, MemoryStatus> = new Map(),
  runs: AnswerRuns = new Map(),
): UiMessage[] {
  const out: UiMessage[] = [];
  const attById = new Map(atts.map((a) => [a.id, a]));
  let current: Extract<UiMessage, { role: "assistant" }> | null = null;
  const ensure = (id: string) => {
    if (!current) {
      current = { id, role: "assistant", text: "", tools: [], confirmations: [], memories: [] };
      out.push(current);
    }
    return current;
  };
  for (const m of rows) {
    if (m.role === "user") {
      current = null;
      out.push({ id: m.id, role: "user", text: m.content, attachments: m.attachmentIds.map((id) => attById.get(id)).filter((a): a is Att => !!a) });
    } else if (m.role === "assistant") {
      const a = ensure(m.id);
      if (m.status === "error") a.error = m.content;
      else a.text = a.text ? `${a.text}\n\n${m.content}` : m.content;
      // the answer a run points at keeps its thumbs after the chat is loaded again (before, they went at the first refresh)
      const run = runs.get(m.id);
      if (run) {
        a.runId = run.runId;
        a.rating = run.rating === 1 || run.rating === -1 ? run.rating : null;
      }
    } else if (m.role === "tool" && m.toolName) {
      const a = ensure(m.id);
      // Text before a tool call was narration; the bubble keeps only the final answer.
      a.text = "";
      const action = actions.find((x) => x.toolCallId === m.toolCallId);
      if (action) {
        a.confirmations.push({
          actionId: action.id,
          summary: action.summary,
          status: action.status === "running" ? "pending" : action.status,
          resultText: action.status === "running" ? "Working…" : action.result ? (action.result.ok ? "Done" : action.result.error) : undefined,
        });
      } else {
        const d = describeToolResult(m.toolName, m.toolResult ?? { ok: false });
        const tool: UiTool = {
          callId: m.toolCallId ?? m.id,
          name: m.toolName,
          label: describeToolCall(m.toolName),
          status: m.toolResult?.ok ? "ok" : "error",
          summary: d.summary,
          viewAt: d.viewAt,
          sources: d.sources,
        };
        a.tools.push(tool);
        const p = memoryProposalOf(m.toolName, m.toolResult ?? { ok: false });
        if (p) {
          const st = memoryStatus.get(p.memoryId);
          a.memories.push({ ...p, status: st ? SUGGESTION_STATUS[st] : "gone" });
        }
      }
    }
  }
  return out;
}
