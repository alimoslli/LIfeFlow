import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { truncate } from "@/lib/utils";
import { assistantProfile, nameAtStart, UNNAMED_ASSISTANT } from "@/lib/assistant";
import { attachments, conversations, messages, type JarvisModule, type JarvisRunOutcome, type ToolResultRecord } from "../db/schema";
import { withUser } from "../db/with-user";
import type { SessionUser } from "../auth/sessions";
import { listActiveMemories, touchMemories } from "../services/memory";
import { createConversation, getConversation, loadHistory } from "./conversations";
import { stopRequested } from "./stop";
import { claimContinuation, turnStateOf, TURN_DEADLINE_MS } from "./turn-state";
import { executeToolCall, serializeResult } from "./executor";
import { selectMemories } from "./memory-retrieval";
import { addUsage, errorKindOf, recordRun, type ModelPrices } from "./metrics";
import { pickPrices, priceTokens } from "../services/ai-prices";
import { AiRefusedError, providerRefusedBeforeWork, subjectFor, reserveAi, type AiHold } from "../services/ai-gate";
import type { AiRefusal, PersonLimits } from "../services/ai-limits";
import { chatStepEstimate, inputChars, STEP_OUTPUT_TOKEN_CAP } from "../services/ai-estimates";
import { recordAiQuiet, type AiDoor } from "../services/ai-usage";
import { routeSkills } from "./skills";
import { buildSystemPrompt, PROMPT_VERSION } from "./prompt";
import type { ModelProvider, TokenUsage } from "./providers/types";
import { toolSpecsFor, type ToolSpec } from "./registry";
import { chooseEffort } from "./effort";
import { TOOL_GROUPS, type ToolGroup } from "./tool-groups";
import { selectToolGroups } from "./tool-select";
import type { ToolContext } from "./tool";
import { describeToolCall, describeToolResult, memoryProposalOf } from "./labels";
import { looksLikeGradedWork } from "@/lib/integrity";
import { openQuestions } from "../services/proactive/questions";

export type JarvisEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; callId: string; name: string; label: string }
  | { type: "tool_end"; callId: string; name: string; ok: boolean; summary: string; viewAt?: string; sources?: { title: string; url: string }[] }
  | { type: "confirmation"; actionId: string; callId: string; toolName: string; summary: string }
  | { type: "memory_proposal"; callId: string; memoryId: string; content: string; replaces?: string }
  /** This send was already received (a retry): nothing new runs; the app fetches the saved answer. */
  | { type: "already"; state: "running" | "finished" }
  | { type: "done"; messageId: string | null; runId?: string | null }
  | { type: "error"; message: string };

export const MAX_STEPS = 8;

class DuplicateSend extends Error {}

class TimedOutError extends Error {
  constructor() {
    super("Took too long.");
  }
}

class StoppedError extends Error {
  constructor() {
    super("Stopped.");
  }
}

export type TurnInput = {
  user: SessionUser;
  conversationId?: string | null;
  text: string;
  attachmentIds?: string[];
  module?: JarvisModule | null;
  provider: ModelProvider;
  emit: (e: JarvisEvent) => void;
  now?: Date;
  /**
   * The id the app made for this send. If a message with this id is already saved, no second turn starts: a finished one
   * is reported as such, a running one is left to finish, and one that died without an answer is continued (the message
   * is not saved twice). Stop is keyed by it too. Without one (older callers) the server makes its own.
   */
  clientMessageId?: string | null;
  /** How long this turn may run before it is closed with a calm line (default: a little under the platform's own limit). Tests shorten it. */
  deadlineMs?: number;
  /** Model prices for cost estimates; omitted ⇒ cost recorded as unknown. */
  prices?: ModelPrices;
  /** Prices of the small model, for turns it answered (the provider's `turn.model`). */
  smallPrices?: ModelPrices;
  /** Money is behind the Face ID lock right now (see auth/money-lock). */
  moneyLocked?: boolean;
  /** Which entrance this turn came through, for the usage record (chat_route by default; texts say sms_inbound). */
  door?: AiDoor;
  /** Replaces the per-person limits for this turn. For tests only; the app always uses the configured limits. */
  aiLimits?: PersonLimits;
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
export async function runJarvisTurn(input: TurnInput): Promise<{ conversationId: string; runId: string | null; refused?: AiRefusal | null }> {
  const { user, provider } = input;
  const now = input.now ?? new Date();
  const started = performance.now();
  const deadlineMs = input.deadlineMs ?? TURN_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  let firstTokenMs: number | null = null;
  const emit = (e: JarvisEvent) => {
    if (e.type === "text" && firstTokenMs == null) firstTokenMs = performance.now() - started;
    try {
      input.emit(e);
    } catch {
      // Nobody is listening any more (the connection dropped). The turn still runs to the end and is saved.
    }
  };
  const run = <T>(fn: Parameters<typeof withUser<T>>[1]) => withUser(user.id, fn);

  // 0. The same send arriving again (a retry after a dropped connection) never starts a second turn.
  const clientMessageId = input.clientMessageId ?? randomUUID();
  const prior = input.clientMessageId ? await run((s) => turnStateOf(s, clientMessageId)) : null;
  const alreadyHandled = async (state: "running" | "finished", conversationId: string) => {
    const conv = await run((s) => getConversation(s, conversationId));
    input.emit({ type: "conversation", id: conv.id, title: conv.title });
    input.emit({ type: "already", state });
    return { conversationId: conv.id, runId: null as string | null };
  };
  if (prior && prior.conversationId && (prior.state === "running" || prior.state === "finished")) return alreadyHandled(prior.state, prior.conversationId);
  const continuing = prior && prior.state === "stalled" ? prior.conversationId : null;
  // Only one request may continue a dead send; the others are told it is already running.
  if (continuing && !(await claimContinuation(user.id, clientMessageId))) return alreadyHandled("running", continuing);

  // 1–2. Conversation, user message and context in one transaction (fewer round trips before the first word).
  let opened;
  try {
    opened = await run(async (s) => {
      const conversation = continuing
        ? await getConversation(s, continuing)
        : input.conversationId
          ? await getConversation(s, input.conversationId)
          : await createConversation(s, input.module, truncate(input.text.replace(/\s+/g, " ").trim() || "Attachment", 60));
      const ids = input.attachmentIds ?? [];
      let attachmentIds: string[] = [];
      if (ids.length && !continuing) {
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
      if (!continuing) {
        const saved = await s.tx
          .insert(messages)
          .values({ userId: s.userId, conversationId: conversation.id, role: "user", content: input.text, attachmentIds, clientMessageId })
          .onConflictDoNothing()
          .returning({ id: messages.id });
        // Two copies of the same send raced; the other one owns the turn. Undo this one (including a chat it just made).
        if (!saved.length) throw new DuplicateSend();
      }
      const history = await loadHistory(s, conversation.id);
      const approved = await listActiveMemories(s, now);
      // A fresh chat with learning on: the questions Jarvis could still ask (it picks at most one, when it fits).
      const curious = user.preferences?.jarvis?.learning && history.length <= 1 ? (await openQuestions(s, user.preferences, approved)).questions : [];
      // Rotate daily so an unanswered question doesn't come up in every new chat.
      const day = Math.floor(now.getTime() / 86_400_000);
      const pick = [0, 1, 2].filter((i) => i < curious.length).map((i) => curious[(day + i) % curious.length].ask);
      return { conversation, history, approved, curious: pick };
    });
  } catch (e) {
    if (!(e instanceof DuplicateSend)) throw e;
    const again = await run((s) => turnStateOf(s, clientMessageId));
    if (again.conversationId) return alreadyHandled(again.state === "finished" ? "finished" : "running", again.conversationId);
    throw e;
  }
  const { conversation, history, approved, curious } = opened;
  emit({ type: "conversation", id: conversation.id, title: conversation.title });
  const openedFrom = input.module ?? conversation.contextModule;
  // Only memories relevant to this request (and earlier messages in this chat) reach the model.
  const earlier = history.flatMap((h) => (h.type === "user" ? [h.text] : [])).slice(0, -1);
  const memories = selectMemories(approved, { text: input.text, recent: earlier, module: openedFrom });
  const skills = routeSkills(input.text, openedFrom);
  const coachMode = looksLikeGradedWork(input.text);
  const system = buildSystemPrompt({
    skills,
    coachMode,
    userName: user.name.split(" ")[0],
    tz: user.timezone,
    now,
    accountKind: user.accountKind,
    module: openedFrom,
    memories,
    otherMemoryCount: approved.length - memories.length,
    preferences: user.preferences,
    openQuestions: curious,
  });
  // Bookkeeping only; it doesn't delay the model call.
  const touched = run((s) =>
    touchMemories(
      s,
      memories.map((m) => m.id),
    ),
  ).catch(() => undefined);
  const ctx = makeToolContext(user, conversation.id, now, input.text, input.moneyLocked);

  // 3. Model/tool loop. Only the tool groups this request needs (load_tools adds more), a per-user cache key,
  // and a thinking level that fits the request.
  const last = history[history.length - 1];
  const hasFiles = last?.type === "user" && !!(last.images?.length || last.files?.length);
  const groups = new Set<ToolGroup>(selectToolGroups({ text: input.text, module: openedFrom, skills, history }));
  const effort = chooseEffort({ text: input.text, skills, hasFiles, coachMode, moneyTools: groups.has("money") || groups.has("money_edit") });
  // Short by default (owner, 2026-11-09); "detailed" tone gets medium, never an essay.
  const verbosity = user.preferences?.jarvisTone === "detailed" ? "medium" : "low";
  const turn = provider.startTurn({
    system,
    history,
    tools: toolSpecsFor(groups),
    cacheKey: promptCacheKey(user.id),
    effort,
    verbosity,
    signal: AbortSignal.timeout(deadlineMs),
    maxOutputTokens: STEP_OUTPUT_TOKEN_CAP,
  });
  let nextTools: ToolSpec[] | undefined;
  let toolResults: { callId: string; output: string }[] | undefined;
  let finalMessageId: string | null = null;
  const tally = { steps: 0, toolCalls: 0, toolErrors: 0, confirmations: 0, toolNames: [] as string[], usage: null as TokenUsage | null };
  let outcome: JarvisRunOutcome = "ok";
  let errorKind: string | null = null;
  let refused: AiRefusal | null = null;
  let hold: AiHold | null = null;
  let extraChars = 0;
  const subject = await subjectFor(user.id, {
    id: user.id,
    timezone: user.timezone,
    plan: user.plan,
    accountKind: user.accountKind,
    preferences: user.preferences,
  });
  // Only the Stop button ends a turn early. A dropped connection (a phone locking, a network blip) never does:
  // the turn runs to the end and is saved whether or not anyone is still listening.
  // A tool that hangs cannot hold the turn past its deadline (the tool itself can't be cancelled, but the turn is closed and recorded).
  const beforeDeadline = <T>(work: Promise<T>): Promise<T> => {
    const left = deadline - Date.now();
    if (left <= 0) return Promise.reject(new TimedOutError());
    let timer: ReturnType<typeof setTimeout>;
    const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new TimedOutError()), left)));
    work.catch(() => undefined);
    return Promise.race([work, late]).finally(() => clearTimeout(timer));
  };
  const stopIfAsked = async () => {
    if (Date.now() >= deadline) throw new TimedOutError();
    if (await stopRequested(user.id, clientMessageId)) throw new StoppedError();
  };
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      await stopIfAsked();
      let text = "";
      let calls: { callId: string; name: string; arguments: string }[] = [];
      // Set the step's estimated cost aside (and, on the first step, the message itself) before the model is called; refused work never reaches it.
      const stepModel = turn.model ?? provider.model;
      const { chars, attachments } = inputChars(system, history, extraChars);
      hold = await reserveAi(
        subject,
        {
          feature: input.door === "sms_inbound" ? "sms" : "chat",
          firstStep: step === 0 && !continuing,
          estimateMicros: chatStepEstimate(pickPrices(stepModel, input.prices, input.smallPrices, provider.model), chars, attachments),
        },
        { limits: input.aiLimits },
      );
      tally.steps++;
      let sawEvent = false;
      let stepUsage: TokenUsage | undefined;
      let cutOff = false;
      try {
        for await (const ev of turn.step(toolResults, nextTools)) {
          sawEvent = true;
          if (ev.type === "text_delta") emit({ type: "text", delta: ev.delta });
          else {
            text = ev.text;
            calls = ev.toolCalls;
            stepUsage = ev.usage;
            cutOff = !!ev.incomplete;
            tally.usage = addUsage(tally.usage, ev.usage);
          }
        }
      } catch (e) {
        // A provider that refused before doing any work billed nothing: give the hold back. Anything else may have been billed: its estimate counts.
        if (!sawEvent && providerRefusedBeforeWork(e)) await hold.release();
        else await hold.settle({ micros: null });
        hold = null;
        throw e;
      }
      await hold.settle({ micros: priceTokens(turn.model ?? provider.model, stepUsage ?? null, input.prices, input.smallPrices, provider.model).costMicros });
      hold = null;
      extraChars += text.length;
      if (cutOff) {
        // The model ran out of room mid-answer (or mid tool call). Keep what it wrote, say so plainly, and record the turn honestly (not "ok").
        if (text.trim()) {
          const [m] = await run((s) =>
            s.tx
              .insert(messages)
              .values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: text })
              .returning({ id: messages.id }),
          );
          finalMessageId = m.id;
        }
        const note = `${text.trim() ? "\n\n" : ""}${TOO_BIG.replace("{name}", assistantProfile(user.preferences, user.timezone).name)}`;
        emit({ type: "text", delta: note });
        await run((s) =>
          s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: note.trim(), status: "error" }),
        );
        outcome = "error";
        errorKind = "output_cap";
        break;
      }
      if (text.trim()) {
        const [m] = await run((s) =>
          s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: text }).returning({ id: messages.id }),
        );
        finalMessageId = m.id;
      }
      if (!calls.length) break;

      toolResults = [];
      nextTools = undefined;
      for (const call of calls) {
        await stopIfAsked();
        emit({ type: "tool_start", callId: call.callId, name: call.name, label: describeToolCall(call.name) });
        const outcome = await beforeDeadline(executeToolCall(call.name, call.arguments, ctx, call.callId));
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
        extraChars += toolResults[toolResults.length - 1].output.length;
        if (call.name === "load_tools" && outcome.kind === "result" && outcome.result.ok) {
          const loaded = ((outcome.result.data as { loaded?: string[] } | undefined)?.loaded ?? []).filter((g): g is ToolGroup =>
            (TOOL_GROUPS as readonly string[]).includes(g),
          );
          for (const g of loaded) groups.add(g);
          nextTools = toolSpecsFor(groups);
        }
      }
      if (step === MAX_STEPS - 1) {
        outcome = "step_limit";
        const note = "\n\nI stopped after several steps to avoid running too long. Ask me to continue if needed.";
        emit({ type: "text", delta: note });
        await run((s) => s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: note.trim() }));
      }
    }
  } catch (e) {
    if (e instanceof StoppedError) {
      // The user pressed Stop: nothing more runs, what was already saved stays, and no error is shown.
      outcome = "cancelled";
      errorKind = "cancelled";
    } else if (e instanceof AiRefusedError) {
      // A limit was reached: the model was never called for this step. Said plainly in the thread, like any other end of a turn.
      refused = e.refusal;
      outcome = "error";
      errorKind = "limit";
      await run((s) =>
        s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: e.message, status: "error" }),
      );
      emit({ type: "error", message: e.message });
    } else {
      console.error("[jarvis] turn failed", e);
      const timedOut = e instanceof TimedOutError || Date.now() >= deadline;
      outcome = "error";
      errorKind = timedOut ? "timeout" : errorKindOf(e, false);
      const message = timedOut ? TOOK_TOO_LONG : friendlyProviderError(e, assistantProfile(user.preferences, user.timezone).name);
      await run((s) =>
        s.tx.insert(messages).values({ userId: s.userId, conversationId: conversation.id, role: "assistant", content: message, status: "error" }),
      );
      emit({ type: "error", message });
    }
  } finally {
    await touched;
    await run((s) => s.tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id)));
  }
  let runId: string | null = null;
  const usedModel = turn.model ?? provider.model;
  const priced = priceTokens(usedModel, tally.usage, input.prices, input.smallPrices, provider.model);
  try {
    runId = await run((s) =>
      recordRun(s, {
        conversationId: conversation.id,
        messageId: finalMessageId,
        provider: provider.name,
        model: usedModel,
        promptVersion: PROMPT_VERSION,
        outcome,
        errorKind,
        latencyMs: performance.now() - started,
        firstTokenMs,
        ...tally,
        costMicros: priced.costMicros,
        memoryIds: memories.map((x) => x.id),
        skills: skills.map((k) => k.name),
      }),
    );
  } catch (e) {
    // Metrics must never break a turn the user already received.
    console.error("[jarvis] could not record run metrics", e);
  }
  // The usage record (ADR 0035): one row per turn, written in its own short transaction, so it exists even if the run row could not be saved.
  if (!(refused && tally.steps === 0))
    await recordAiQuiet({
      userId: user.id,
      feature: input.door === "sms_inbound" ? "sms" : "chat",
      door: input.door ?? "chat_route",
      provider: provider.name,
      model: usedModel,
      state: outcome === "error" ? "failed" : "settled",
      conversationId: conversation.id,
      runId,
      usage: tally.usage,
      steps: tally.steps,
      costMicros: priced.costMicros,
      priceKey: priced.priceKey,
    });
  emit({ type: "done", messageId: finalMessageId, runId });
  return { conversationId: conversation.id, runId, refused };
}

/**
 * What the user reads (and what is saved as the assistant's message) when a turn fails: plain
 * words with their assistant's name. Never the provider, a setting, a key or the raw error;
 * the turn logs those with console.error.
 */
export function friendlyProviderError(e: unknown, name: string = UNNAMED_ASSISTANT): string {
  const who = nameAtStart(name);
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403 || status === 404) return `${who} isn't available right now. Try again later.`;
  if (status === 429) return `${who} is busy right now. Try again in a minute.`;
  if (status && status >= 500) return `${who} isn't available right now. Try again in a minute.`;
  const msg = e instanceof Error ? e.message : "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network|timed out/i.test(msg))
    return `${who} couldn't get through just now. Try again in a minute. Nothing else was changed.`;
  return `Something went wrong while ${name} was answering. Try again. Anything already shown as done was saved.`;
}

/** Said when a step ran out of room before it could finish (the person is asked for less, in the skyling's voice). */
export const TOO_BIG = "That was more than {name} could fit in one answer, so it stopped part way. Try asking for a smaller piece, or one thing at a time.";

/** Saved and shown when a turn runs out of time (its deadline is a little before the platform's own limit). */
export const TOOK_TOO_LONG = "That took too long, so I stopped. Try again.";

export type { ToolResultRecord };

/** A stable, non-identifying key per user, so one person's requests reuse the same cached prompt start at OpenAI. */
export const promptCacheKey = (userId: string) => `lf-${createHash("sha256").update(`jarvis:${userId}`).digest("hex").slice(0, 24)}`;
