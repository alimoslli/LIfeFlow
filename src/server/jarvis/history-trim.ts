import type { ChatItem } from "./providers/types";
import { getTool } from "./registry";

/** What became of a confirm card, from its pending_actions row (by tool call id). */
export type ConfirmOutcome = "executed" | "cancelled" | "failed" | "expired" | "pending";

const SAID: Record<ConfirmOutcome, string> = {
  executed: "done after the user confirmed",
  cancelled: "cancelled by the user, nothing was changed",
  failed: "failed, nothing was changed",
  expired: "expired unconfirmed, nothing was changed",
  pending: "still waiting for the user to press Confirm",
};

const changesThings = (name: string) => {
  const t = getTool(name);
  return !!t && (t.mutates || !!t.confirm);
};

/** Up to three names of what a step saved ("Email advisor"), read from its own result; never more than that. */
function named(output: string): string[] {
  const out = new Set<string>();
  for (const m of output.matchAll(/"(?:title|name|summary)":"([^"\\]{1,60})"/g)) {
    out.add(m[1]);
    if (out.size === 3) break;
  }
  return [...out];
}

/** One line in place of a step that changed something, so a later "did that go in?" or "send it again" sees what happened. */
export function stepStub(name: string, output: string | undefined, outcome?: ConfirmOutcome): string {
  let ok: boolean | undefined;
  let status: string | undefined;
  try {
    const r = JSON.parse(output ?? "") as { ok?: boolean; data?: { status?: string } };
    ok = r.ok;
    status = r.data?.status;
  } catch {}
  const card =
    outcome ?? (status === "awaiting_user_confirmation" ? "pending" : (["executed", "cancelled", "failed", "expired"] as const).find((s) => s === status));
  const what = card ? SAID[card] : ok === false ? "failed, nothing was changed" : "saved";
  const names = output ? named(output) : [];
  return `[Earlier in this chat: ${name} ${what}${names.length ? ` (${names.join(", ")})` : ""}. Its details aren't repeated here.]`;
}

/**
 * Cost (docs/backlog/2026-11-12-long-chat-trim.md): in a long chat every earlier tool call and result was sent again on every
 * step, and each one kept its tool group on the list, so the ninth question of a day carried 80 tools instead of 15.
 * Earlier turns keep their words (the user's messages and the skyling's answers); only the last finished turn and the
 * current one keep their tool steps, so a follow-up ("ok, book the second one") still sees what was just looked up.
 * COO review (2026-11-12):
 * - a step that changed something leaves a one-line stub with its outcome ("create_tasks saved (Email advisor)"), and a
 *   confirm card says what really became of it (`confirmed`, from pending_actions), so nothing is saved or sent twice;
 * - a turn that ended without any words after its tool steps is never trimmed: its steps are the only record of it.
 */
export function keepRecentToolSteps(
  history: ChatItem[],
  opts: { turnsWithTools?: number; confirmed?: Record<string, ConfirmOutcome>; changes?: (name: string) => boolean } = {},
): ChatItem[] {
  const keepTurns = opts.turnsWithTools ?? 2;
  const changes = opts.changes ?? changesThings;
  const users = history.flatMap((h, i) => (h.type === "user" ? [i] : []));
  if (users.length <= keepTurns) return history;
  const from = users[users.length - keepTurns];
  const out: ChatItem[] = [];
  // the earlier turns, one at a time (anything before the first message is kept as it is)
  const starts = users.filter((i) => i < from);
  out.push(...history.slice(0, starts[0] ?? from));
  starts.forEach((start, n) => {
    const turn = history.slice(start, starts[n + 1] ?? from);
    const lastStep = turn.map((h) => h.type === "tool_call" || h.type === "tool_result").lastIndexOf(true);
    const answered = lastStep >= 0 && turn.slice(lastStep + 1).some((h) => h.type === "assistant" && h.text.trim() !== "");
    if (lastStep < 0 || !answered) {
      out.push(...turn);
      return;
    }
    const results = new Map(turn.flatMap((h) => (h.type === "tool_result" ? [[h.callId, h.output] as const] : [])));
    for (const h of turn) {
      if (h.type === "tool_result") continue;
      if (h.type !== "tool_call") out.push(h);
      else if (changes(h.name)) out.push({ type: "assistant", text: stepStub(h.name, results.get(h.callId), opts.confirmed?.[h.callId]) });
    }
  });
  out.push(...history.slice(from));
  return out;
}

/** The tool calls in a history whose card was shown and may have been decided since (to look up in pending_actions). */
export const confirmCallIds = (history: ChatItem[]) =>
  history.flatMap((h) => (h.type === "tool_result" && h.output.includes('"awaiting_user_confirmation"') ? [h.callId] : []));
