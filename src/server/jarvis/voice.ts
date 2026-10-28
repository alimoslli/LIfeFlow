import { and, eq } from "drizzle-orm";
import OpenAI from "openai";
import { assistantProfile } from "@/lib/assistant";
import type { SessionUser } from "../auth/sessions";
import { conversations, messages, type JarvisModule, type ToolResultRecord } from "../db/schema";
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
This is a live voice conversation. Keep replies short and natural, like talking to a friend: one to three sentences, no markdown, no lists or tables, no URLs. Say numbers and dates the way people say them. If something needs the user to press Confirm, tell them a confirmation card is on their screen. If you didn't catch something, ask them to repeat it.`;

export const VOICE_SESSION_SECONDS = 15 * 60;

export async function buildVoiceSession(user: SessionUser, module: JarvisModule | null, now = new Date()) {
  const approved = await withUser(user.id, (s) => listActiveMemories(s, now));
  // No spoken request yet: standing instructions only; the model can call list_memories for more.
  const memories = selectMemories(approved, { text: "", module });
  const profile = assistantProfile(user.preferences);
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
    }) + VOICE_RULES;
  const tools = toolSpecs().map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters }));
  return { instructions, tools, voice: profile.voice, name: profile.name, memoryIds: memories.map((m) => m.id) };
}

/** Creates the conversation that holds this call's transcript, and a short-lived OpenAI client secret. */
export async function startVoiceSession(user: SessionUser, module: JarvisModule | null, client?: OpenAI) {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set on the server.");
  const openai = client ?? new OpenAI({ apiKey: e.OPENAI_API_KEY, baseURL: e.OPENAI_BASE_URL, maxRetries: 1, timeout: 20_000 });
  const session = await buildVoiceSession(user, module);
  const secret = await openai.realtime.clientSecrets.create({
    expires_after: { anchor: "created_at", seconds: 120 },
    session: {
      type: "realtime",
      model: e.OPENAI_REALTIME_MODEL,
      instructions: session.instructions,
      tools: session.tools,
      audio: {
        input: { transcription: { model: "gpt-4o-mini-transcribe" }, turn_detection: { type: "semantic_vad" }, noise_reduction: { type: "near_field" } },
        output: { voice: session.voice },
      },
    },
  });
  const conversation = await withUser(user.id, (s) => createConversation(s, module, `Voice chat with ${session.name}`));
  return {
    clientSecret: secret.value,
    expiresAt: secret.expires_at,
    model: e.OPENAI_REALTIME_MODEL,
    conversationId: conversation.id,
    maxSeconds: VOICE_SESSION_SECONDS,
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
  input: { conversationId: string; callId: string; name: string; arguments: string; userText?: string },
  opts: { moneyLocked?: boolean } = {},
): Promise<VoiceToolResult> {
  await ownedConversation(user, input.conversationId);
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
