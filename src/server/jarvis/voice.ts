import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { inTestingPhase, requirePro, TESTING_LIMITS } from "../billing";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { HttpError } from "../http";
import OpenAI from "openai";
import { assistantProfile } from "@/lib/assistant";
import type { SessionUser } from "../auth/sessions";
import { conversations, messages, voiceSessions, voiceToolCalls, type JarvisModule, type ToolResultRecord } from "../db/schema";
import { withUser } from "../db/with-user";
import { env } from "../env";
import { listActiveMemories } from "../services/memory";
import { makeToolContext } from "./agent";
import { createConversation } from "./conversations";
import { executeToolCall, serializeResult } from "./executor";
import { describeToolCall, describeToolResult, memoryProposalOf } from "./labels";
import { selectMemories } from "./memory-retrieval";
import { recordRun } from "./metrics";
import { buildSystemPrompt, PROMPT_VERSION } from "./prompt";
import { toolSpecs } from "./registry";

/**
 * Live voice with the assistant (OpenAI Realtime over WebRTC).
 *
 * The browser never sees the OpenAI API key: the server mints a short-lived
 * client secret bound to this user's session config (instructions, voice,
 * tools). Audio flows browser <-> OpenAI directly. Tool calls come back to
 * the browser, which relays them here, where they run through the same
 * executor as typed chat (validation, RLS, confirmations, audit).
 */

const VOICE_RULES = `

# Speaking out loud
This is a live voice conversation. Keep replies short and natural, like talking to a friend: one to three sentences, no markdown, no lists or tables, no URLs. Say numbers and dates the way people say them. If something needs the user to press Confirm, tell them a confirmation card is on their screen. If you didn't catch something, ask them to repeat it.

# Talk first, then do it
Never go silent while you work. When the user asks you to change something (edit assignments, move events, add tasks), first say one short sentence out loud about what you're doing ("Sure, moving all three to Friday now"), then call the tools in that same response. Make every change the request needs at once, in parallel, not one per turn. When the results come back, confirm in one sentence what actually changed, or say what didn't work.`;

export const VOICE_SESSION_SECONDS = 15 * 60;
/** Tool calls still land for a moment after the time is up (the last answer is being spoken). */
const VOICE_GRACE_SECONDS = 60;

/** The last few typed or spoken lines of the chat, so a call picks up where the conversation was. */
async function recentLines(user: SessionUser, conversationId: string, limit = 12) {
  const rows = await withUser(user.id, (s) =>
    s.tx
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, s.userId), inArray(messages.role, ["user", "assistant"])))
      .orderBy(desc(messages.createdAt))
      .limit(limit),
  );
  return rows
    .reverse()
    .filter((r) => r.content?.trim())
    .map((r) => `${r.role === "user" ? "User" : "You"}: ${r.content.replace(/\s+/g, " ").slice(0, 400)}`);
}

export async function buildVoiceSession(user: SessionUser, module: JarvisModule | null, now = new Date(), history: string[] = []) {
  const approved = await withUser(user.id, (s) => listActiveMemories(s, now));
  // No spoken request yet: standing instructions only; the model can call list_memories for more.
  const memories = selectMemories(approved, { text: "", module });
  const profile = assistantProfile(user.preferences, user.timezone);
  const instructions =
    buildSystemPrompt({
      userName: user.name.split(" ")[0],
      tz: user.timezone,
      now,
      accountKind: user.accountKind,
      module,
      memories,
      otherMemoryCount: approved.length - memories.length,
      preferences: user.preferences,
      assistant: profile,
    }) +
    VOICE_RULES +
    (history.length ? `\n\n# This conversation so far (they switched from typing to talking; continue naturally, don't recap)\n${history.join("\n")}` : "");
  const tools = toolSpecs()
    .filter((t) => t.name !== "load_tools")
    .map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters }));
  return { instructions, tools, voice: profile.voice, name: profile.name, memoryIds: memories.map((m) => m.id) };
}

/**
 * A short-lived OpenAI client secret for a call. The call continues the chat it was started
 * from (its transcript lands in the same thread, and the model gets the recent messages);
 * from an empty chat it starts a new conversation.
 */
export async function startVoiceSession(user: SessionUser, module: JarvisModule | null, client?: OpenAI, conversationId?: string | null) {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new Error("Voice isn't available right now.");
  const openai = client ?? new OpenAI({ apiKey: e.OPENAI_API_KEY, baseURL: e.OPENAI_BASE_URL, maxRetries: 1, timeout: 20_000 });
  if (conversationId) await ownedConversation(user, conversationId);
  const session = await buildVoiceSession(user, module, new Date(), conversationId ? await recentLines(user, conversationId) : []);
  const secret = await openai.realtime.clientSecrets.create({
    expires_after: { anchor: "created_at", seconds: 120 },
    session: {
      type: "realtime",
      model: e.OPENAI_REALTIME_MODEL,
      instructions: session.instructions,
      tools: session.tools,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          // Semantic turn detection: it listens to what's said, so a mid-sentence pause ("so I need to... um") waits,
          // and a finished thought gets an answer. The client also has a Done button for noisy places.
          turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
          // Far-field suits laptop mics and phones on speaker, and keeps room noise from sounding like speech.
          noise_reduction: { type: "far_field" },
        },
        output: { voice: session.voice },
      },
    },
  });
  const maxSeconds = inTestingPhase() ? TESTING_LIMITS.voiceCallMinutes * 60 : VOICE_SESSION_SECONDS;
  // The server's own record of this call: tool calls are accepted only for a live row of this user and conversation.
  const conversation = await withUser(user.id, async (s) => {
    const c = conversationId ? { id: conversationId } : await createConversation(s, module, `Talking with ${session.name}`);
    await s.tx.delete(voiceSessions).where(lt(voiceSessions.expiresAt, new Date(Date.now() - 3_600_000)));
    const [vs] = await s.tx
      .insert(voiceSessions)
      .values({ userId: s.userId, conversationId: c.id, expiresAt: new Date(Date.now() + (maxSeconds + VOICE_GRACE_SECONDS) * 1000) })
      .returning({ id: voiceSessions.id });
    return { id: c.id, voiceSessionId: vs.id };
  });
  return {
    voiceSessionId: conversation.voiceSessionId,
    clientSecret: secret.value,
    expiresAt: secret.expires_at,
    model: e.OPENAI_REALTIME_MODEL,
    conversationId: conversation.id,
    // Shorter calls while LifeFlow is in testing (see TESTING_LIMITS).
    maxSeconds,
  };
}

async function ownedConversation(user: SessionUser, conversationId: string) {
  const [c] = await withUser(user.id, (s) =>
    s.tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, s.userId))),
  );
  if (!c) throw new Error("Conversation not found");
}

export type VoiceToolResult = {
  output: string;
  ok: boolean;
  label: string;
  summary: string;
  viewAt?: string;
  confirmation?: { actionId: string; summary: string };
  memoryProposal?: { memoryId: string; content: string; replaces?: string };
};

/** Runs one tool call from a live voice session, exactly like a typed chat tool call. */
export async function relayVoiceTool(
  user: SessionUser,
  input: { voiceSessionId: string; conversationId: string; callId: string; name: string; arguments: string; userText?: string },
  opts: { moneyLocked?: boolean } = {},
): Promise<VoiceToolResult> {
  // The same gates as starting the call and as typed chat: plan and AI consent (sign-in, suspension and the age lock are in getSessionUser).
  requirePro(user, "voice");
  if (!aiAllowed(user.preferences)) throw new HttpError(403, AI_CONSENT_NEEDED);
  await ownedConversation(user, input.conversationId);
  // A server-issued, unexpired call of this user and this conversation, and one claim per call id: a repeat gets the first result.
  const claim = await withUser(user.id, async (s) => {
    const [live] = await s.tx
      .select({ id: voiceSessions.id })
      .from(voiceSessions)
      .where(
        and(
          eq(voiceSessions.id, input.voiceSessionId),
          eq(voiceSessions.userId, s.userId),
          eq(voiceSessions.conversationId, input.conversationId),
          gt(voiceSessions.expiresAt, new Date()),
        ),
      );
    if (!live) return "no-session" as const;
    const [mine] = await s.tx
      .insert(voiceToolCalls)
      .values({ sessionId: live.id, callId: input.callId, userId: s.userId })
      .onConflictDoNothing()
      .returning({ callId: voiceToolCalls.callId });
    if (mine) return "mine" as const;
    const [first] = await s.tx
      .select({ result: voiceToolCalls.result })
      .from(voiceToolCalls)
      .where(and(eq(voiceToolCalls.sessionId, live.id), eq(voiceToolCalls.callId, input.callId)));
    return first?.result ? (first.result as unknown as VoiceToolResult) : ("running" as const);
  });
  if (claim === "no-session") throw new HttpError(403, "This call isn't active any more. Start a new one.");
  if (claim === "running") throw new HttpError(409, "That step is already running.");
  if (claim !== "mine") return claim;
  try {
    const result = await runVoiceTool(user, input, opts);
    await withUser(user.id, (s) =>
      s.tx
        .update(voiceToolCalls)
        .set({ result: result as unknown as Record<string, unknown> })
        .where(and(eq(voiceToolCalls.sessionId, input.voiceSessionId), eq(voiceToolCalls.callId, input.callId))),
    );
    return result;
  } catch (e) {
    // Nothing was recorded as done: let the model's retry run.
    await withUser(user.id, (s) =>
      s.tx.delete(voiceToolCalls).where(and(eq(voiceToolCalls.sessionId, input.voiceSessionId), eq(voiceToolCalls.callId, input.callId))),
    ).catch(() => undefined);
    throw e;
  }
}

async function runVoiceTool(
  user: SessionUser,
  input: { conversationId: string; callId: string; name: string; arguments: string; userText?: string },
  opts: { moneyLocked?: boolean },
): Promise<VoiceToolResult> {
  const ctx = makeToolContext(user, input.conversationId, new Date(), input.userText ?? "", opts.moneyLocked);
  const outcome = await executeToolCall(input.name, input.arguments, ctx, input.callId);
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(input.arguments || "{}");
  } catch {}
  await withUser(user.id, (s) =>
    s.tx.insert(messages).values({
      userId: s.userId,
      conversationId: input.conversationId,
      role: "tool",
      toolName: input.name,
      toolCallId: input.callId,
      toolArgs: args,
      toolResult: outcome.result,
      status: outcome.kind === "confirmation" ? "pending_confirmation" : outcome.result.ok ? "complete" : "error",
    }),
  );
  const d = describeToolResult(input.name, outcome.result as ToolResultRecord);
  const proposal = memoryProposalOf(input.name, outcome.result);
  return {
    output: serializeResult(outcome.result),
    ok: outcome.result.ok,
    label: describeToolCall(input.name),
    summary: d.summary,
    viewAt: d.viewAt,
    ...(outcome.kind === "confirmation" && { confirmation: { actionId: outcome.pendingActionId, summary: outcome.summary } }),
    ...(proposal && { memoryProposal: proposal }),
  };
}

/** Saves one spoken line (the user's transcribed words or the assistant's reply) to the conversation. */
export async function saveVoiceTranscript(user: SessionUser, conversationId: string, role: "user" | "assistant", text: string) {
  await ownedConversation(user, conversationId);
  const content = text.trim().slice(0, 8000);
  if (!content) return;
  await withUser(user.id, async (s) => {
    await s.tx.insert(messages).values({ userId: s.userId, conversationId, role, content });
    await s.tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
  });
}

export type VoiceEndStats = {
  durationMs: number;
  responses: number;
  toolCalls: number;
  toolErrors: number;
  confirmations: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  error?: string;
};

/** One metrics row per call (same table as typed turns; content-free). */
export async function recordVoiceRun(user: SessionUser, conversationId: string, stats: VoiceEndStats) {
  await ownedConversation(user, conversationId);
  const usage =
    stats.inputTokens != null
      ? { inputTokens: stats.inputTokens, cachedInputTokens: stats.cachedInputTokens ?? 0, outputTokens: stats.outputTokens ?? 0, reasoningTokens: 0 }
      : null;
  return withUser(user.id, (s) =>
    recordRun(s, {
      conversationId,
      messageId: null,
      provider: "openai-realtime",
      model: env().OPENAI_REALTIME_MODEL,
      promptVersion: PROMPT_VERSION,
      outcome: stats.error ? "error" : "ok",
      errorKind: stats.error ? "voice" : null,
      latencyMs: Math.max(0, Math.min(stats.durationMs, 3_600_000)),
      firstTokenMs: null,
      steps: stats.responses,
      toolCalls: stats.toolCalls,
      toolErrors: stats.toolErrors,
      confirmations: stats.confirmations,
      toolNames: [],
      usage,
      costMicros: null, // realtime audio is priced differently from text; never guessed
      memoryIds: [],
    }),
  );
}
