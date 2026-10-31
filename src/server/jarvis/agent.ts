import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { truncate } from "@/lib/utils";
import { attachments, conversations, messages, type JarvisModule, type JarvisRunOutcome, type ToolResultRecord } from "../db/schema";
import { withUser } from "../db/with-user";
import type { SessionUser } from "../auth/sessions";
import { listActiveMemories, touchMemories } from "../services/memory";
import { createConversation, getConversation, loadHistory } from "./conversations";
import { executeToolCall, serializeResult } from "./executor";
import { selectMemories } from "./memory-retrieval";
import { addUsage, errorKindOf, estimateCostMicros, recordRun, type ModelPrices } from "./metrics";
import { routeSkills } from "./skills";
import { buildSystemPrompt, PROMPT_VERSION } from "./prompt";
import type { ModelProvider, TokenUsage } from "./providers/types";
import { toolSpecs } from "./registry";
import type { ToolContext } from "./tool";
import { describeToolCall, describeToolResult, memoryProposalOf } from "./labels";
import { looksLikeGradedWork } from "@/lib/integrity";

export type JarvisEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; callId: string; name: string; label: string }
  | { type: "tool_end"; callId: string; name: string; ok: boolean; summary: string; viewAt?: string; sources?: { title: string; url: string }[] }
  | { type: "confirmation"; actionId: string; callId: string; toolName: string; summary: string }
  | { type: "memory_proposal"; callId: string; memoryId: string; content: string; replaces?: string }
  | { type: "done"; messageId: string | null; runId?: string | null }
  | { type: "error"; message: string };

export const MAX_STEPS = 8;

export type TurnInput = {
  user: SessionUser;
  conversationId?: string | null;
  text: string;
  attachmentIds?: string[];
  module?: JarvisModule | null;
  provider: ModelProvider;
  emit: (e: JarvisEvent) => void;
  now?: Date;
  signal?: AbortSignal;
  /** Model prices for cost estimates; omitted ⇒ cost recorded as unknown. */
  prices?: ModelPrices;
  /** Money is behind the Face ID lock right now (see auth/money-lock). */
  moneyLocked?: boolean;
};

export function makeToolContext(user: SessionUser, conversationId: string, now = new Date(), userText = "", moneyLocked = false): ToolContext {
  return {
    userId: user.id,
    tz: user.timezone,
    today: todayIn(user.timezone, now),
    now,
    conversationId,
    userText,
    memorySuggestions: user.preferences?.memorySuggestions !== false,
    moneyLocked,
    run: (fn) => withUser(user.id, fn),
  };
}

/**
 * Runs one user turn: persist the message, let the model call tools in a
 * loop (max MAX_STEPS), persist every tool call and result, and stream
 * progress events. Every write goes through the user's RLS scope.
 */
export async function runJarvisTurn(input: TurnInput): Promise<{ conversationId: string; runId: string | null }> {
  const { user, provider } = input;
  const now = input.now ?? new Date();
  const started = performance.now();
  let firstTokenMs: number | null = null;
  const emit = (e: JarvisEvent) => {
    if (e.type === "text" && firstTokenMs == null) firstTokenMs = performance.now() - started;
    input.emit(e);
  };
  const run = <T>(fn: Parameters<typeof withUser<T>>[1]) => withUser(user.id, fn);

  // 1–2. Conversation, user message and context in one transaction (fewer round trips before the first word).
  const { conversation, history, approved } = await run(async (s) => {
    const conversation = input.conversationId
      ? await getConversation(s, input.conversationId)
      : await createConversation(s, input.module, truncate(input.text.replace(/\s+/g, " ").trim() || "Attachment", 60));
    const ids = input.attachmentIds ?? [];
    let attachmentIds: string[] = [];
    if (ids.length) {
      // Only the user's own, unlinked (or already-this-conversation) uploads may be attached.
      const rows = await s.tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          and(
            eq(attachments.userId, s.userId),
            inArray(attachments.id, ids),
            or(isNull(attachments.conversationId), eq(attachments.conversationId, conversation.id)),
          ),
        );
      attachmentIds = rows.map((r) => r.id);
      if (attachmentIds.length) await s.tx.update(attachments).set({ conversationId: conversation.id }).where(inArray(attachments.id, attachmentIds));
    }
    await s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "user", content: input.text, attachmentIds });
    return { conversation, history: await loadHistory(s, conversation.id), approved: await listActiveMemories(s, now) };
  });
  emit({ type: "conversation", id: conversation.id, title: conversation.title });
  const openedFrom = input.module ?? conversation.contextModule;
  // Only memories relevant to this request (and earlier messages in this chat) reach the model.
  const earlier = history.flatMap((h) => (h.type === "user" ? [h.text] : [])).slice(0, -1);
  const memories = selectMemories(approved, { text: input.text, recent: earlier, module: openedFrom });
  const skills = routeSkills(input.text, openedFrom);
  const system = buildSystemPrompt({
    skills,
    coachMode: looksLikeGradedWork(input.text),
    userName: user.name.split(" ")[0],
    tz: user.timezone,
    now,
    accountKind: user.accountKind,
    module: openedFrom,
    memories,
    otherMemoryCount: approved.length - memories.length,
    preferences: user.preferences,
  });
  // Bookkeeping only; it doesn't delay the model call.
  const touched = run((s) =>
    touchMemories(
      s,
      memories.map((m) => m.id),
    ),
  ).catch(() => undefined);
  const ctx = makeToolContext(user, conversation.id, now, input.text, input.moneyLocked);

  // 3. Model/tool loop
  const turn = provider.startTurn({ system, history, tools: toolSpecs() });
  let toolResults: { callId: string; output: string }[] | undefined;
  let finalMessageId: string | null = null;
  const tally = { steps: 0, toolCalls: 0, toolErrors: 0, confirmations: 0, toolNames: [] as string[], usage: null as TokenUsage | null };
  let outcome: JarvisRunOutcome = "ok";
  let errorKind: string | null = null;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (input.signal?.aborted) throw new Error("Request cancelled.");
      let text = "";
      let calls: { callId: string; name: string; arguments: string }[] = [];
      tally.steps++;
      for await (const ev of turn.step(toolResults)) {
        if (ev.type === "text_delta") emit({ type: "text", delta: ev.delta });
        else {
          text = ev.text;
          calls = ev.toolCalls;
          tally.usage = addUsage(tally.usage, ev.usage);
        }
      }
      if (text.trim()) {
        const [m] = await run((s) =>
          s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: text }).returning({ id: messages.id }),
        );
        finalMessageId = m.id;
      }
      if (!calls.length) break;

      toolResults = [];
      for (const call of calls) {
        emit({ type: "tool_start", callId: call.callId, name: call.name, label: describeToolCall(call.name) });
        const outcome = await executeToolCall(call.name, call.arguments, ctx, call.callId);
        tally.toolCalls++;
        tally.toolNames.push(call.name);
        if (outcome.kind === "confirmation") tally.confirmations++;
        else if (!outcome.result.ok) tally.toolErrors++;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {}
        await run((s) =>
          s.tx.insert(messages).values({
            userId: s.userId,
            conversationId: conversation.id,
            role: "tool",
            toolName: call.name,
            toolCallId: call.callId,
            toolArgs: args,
            toolResult: outcome.result,
            status: outcome.kind === "confirmation" ? "pending_confirmation" : outcome.result.ok ? "complete" : "error",
          }),
        );
        if (outcome.kind === "confirmation") {
          emit({ type: "confirmation", actionId: outcome.pendingActionId, callId: call.callId, toolName: call.name, summary: outcome.summary });
        } else {
          const d = describeToolResult(call.name, outcome.result);
          emit({ type: "tool_end", callId: call.callId, name: call.name, ok: outcome.result.ok, summary: d.summary, viewAt: d.viewAt, sources: d.sources });
          const proposal = memoryProposalOf(call.name, outcome.result);
          if (proposal) emit({ type: "memory_proposal", callId: call.callId, ...proposal });
        }
        toolResults.push({ callId: call.callId, output: serializeResult(outcome.result) });
      }
      if (step === MAX_STEPS - 1) {
        outcome = "step_limit";
        const note = "\n\nI stopped after several steps to avoid running too long. Ask me to continue if needed.";
        emit({ type: "text", delta: note });
        await run((s) => s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: note.trim() }));
      }
    }
  } catch (e) {
    console.error("[jarvis] turn failed", e);
    const aborted = !!input.signal?.aborted;
    outcome = aborted ? "cancelled" : "error";
    errorKind = errorKindOf(e, aborted);
    const message = friendlyProviderError(e);
    await run((s) => s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: message, status: "error" }));
    emit({ type: "error", message });
  } finally {
    await touched;
    await run((s) => s.tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id)));
  }
  let runId: string | null = null;
  try {
    runId = await run((s) =>
      recordRun(s, {
        conversationId: conversation.id,
        messageId: finalMessageId,
        provider: provider.name,
        model: provider.model,
        promptVersion: PROMPT_VERSION,
        outcome,
        errorKind,
        latencyMs: performance.now() - started,
        firstTokenMs,
        ...tally,
        costMicros: estimateCostMicros(tally.usage, input.prices ?? {}),
        memoryIds: memories.map((x) => x.id),
        skills: skills.map((k) => k.name),
      }),
    );
  } catch (e) {
    // Metrics must never break a turn the user already received.
    console.error("[jarvis] could not record run metrics", e);
  }
  emit({ type: "done", messageId: finalMessageId, runId });
  return { conversationId: conversation.id, runId };
}

export function friendlyProviderError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401) return "Jarvis couldn't authenticate with OpenAI. Check OPENAI_API_KEY on the server.";
  if (status === 429) return "OpenAI is rate-limiting requests or the account is out of quota. Try again shortly.";
  if (status === 404) return "The configured OpenAI model wasn't found. Check OPENAI_MODEL.";
  if (status && status >= 500) return "OpenAI is having trouble right now. Please try again.";
  const msg = e instanceof Error ? e.message : "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|timed out/i.test(msg))
    return "Jarvis couldn't reach the AI service (network error). Nothing further was changed.";
  return `Something went wrong while Jarvis was responding${msg ? `: ${truncate(msg, 160)}` : ""}. Any actions already reported as completed were saved.`;
}

export type { ToolResultRecord };
