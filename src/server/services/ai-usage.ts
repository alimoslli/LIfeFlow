import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { getDb } from "../db/client";
import { aiUsage, type AiFeature, type AiState, type AiUsageFrom } from "../db/schema";
import { withUser, type UserScope } from "../db/with-user";
import { settleBudget } from "./ai-budget";
import type { TokenUsage } from "../jarvis/providers/types";

/**
 * The one record of paid AI use (ADR 0035). Every paid call writes a row through here: a chat or text turn, a voice call,
 * a web search, a document read, a tidying batch. Numbers only, never content. Cost is empty when unknown, never 0.
 */

export type AiDoor =
  | "chat_route"
  | "sms_inbound"
  | "voice_session"
  | "chat_tool"
  | "savings_check"
  | "cancel_help"
  | "upload"
  | "share"
  | "email_in"
  | "gmail_filing"
  | "plaid_sync"
  | "tidy_button";

/** Who a paid call is for. Required by every paid-call function, so none can run without a user and an entrance. */
export type AiContext = { userId: string; door: AiDoor; parentId?: string | null };

export type AiUsageInput = {
  userId: string;
  feature: AiFeature;
  door: AiDoor;
  provider: string;
  model: string | null;
  state?: AiState;
  conversationId?: string | null;
  runId?: string | null;
  parentId?: string | null;
  holdId?: string | null;
  usage?: TokenUsage | null;
  usageFrom?: AiUsageFrom | null;
  searchCalls?: number | null;
  seconds?: number | null;
  steps?: number | null;
  /** Measured cost in millionths of a dollar; null/omitted = unknown. */
  costMicros?: number | null;
  priceKey?: string | null;
  /** The estimate set aside, used for `countedMicros` only when the cost isn't known. */
  estimateMicros?: number | null;
};

const whole = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)));

function rowOf(i: AiUsageInput): typeof aiUsage.$inferInsert {
  const cost = whole(i.costMicros);
  const settled = (i.state ?? "settled") !== "held";
  return {
    userId: i.userId,
    feature: i.feature,
    door: i.door,
    provider: i.provider,
    model: i.model,
    state: i.state ?? "settled",
    settledAt: settled ? new Date() : null,
    conversationId: i.conversationId ?? null,
    runId: i.runId ?? null,
    parentId: i.parentId ?? null,
    holdId: i.holdId ?? null,
    inputTokens: whole(i.usage?.inputTokens),
    cachedInputTokens: whole(i.usage?.cachedInputTokens),
    outputTokens: whole(i.usage?.outputTokens),
    reasoningTokens: whole(i.usage?.reasoningTokens),
    searchCalls: whole(i.searchCalls),
    seconds: whole(i.seconds),
    steps: whole(i.steps),
    usageFrom: i.usageFrom ?? (i.usage ? "provider" : null),
    costMicros: cost,
    priceKey: cost == null ? null : (i.priceKey ?? null),
    countedMicros: cost ?? whole(i.estimateMicros),
  };
}

/** Writes one usage row in its own short transaction (never inside the person's own work, so a rollback can't erase it). Returns its id. */
export async function recordAi(input: AiUsageInput, db: Database = getDb()): Promise<string> {
  const [row] = await withUser(input.userId, (s) => s.tx.insert(aiUsage).values(rowOf(input)).returning({ id: aiUsage.id }), db);
  return row.id;
}

/** Like recordAi, but a failure to save is logged (class only, never details) and never breaks the work the person asked for. */
export async function recordAiQuiet(input: AiUsageInput, db?: Database): Promise<string | null> {
  try {
    return await recordAi(input, db);
  } catch (e) {
    console.error("[ai-usage] could not record", input.feature, e instanceof Error ? e.name : typeof e);
    return null;
  }
}

/** Adds the reported usage of several steps into one total (null when none reported any). */
export function sumUsage(parts: (TokenUsage | null | undefined)[]): TokenUsage | null {
  let total: TokenUsage | null = null;
  for (const p of parts) {
    if (!p) continue;
    total = total
      ? {
          inputTokens: total.inputTokens + p.inputTokens,
          cachedInputTokens: total.cachedInputTokens + p.cachedInputTokens,
          outputTokens: total.outputTokens + p.outputTokens,
          reasoningTokens: total.reasoningTokens + p.reasoningTokens,
        }
      : { ...p };
  }
  return total;
}

/** A held row that was never settled (a closed tab, a crashed request) is closed as expired after this long. */
export const HELD_ROW_MAX_AGE_MS = 60 * 60_000;

/** Closes this person's held rows older than an hour as expired: the reserved amount stays counted, the cost stays unknown. */
export async function expireStaleAiUsage(s: UserScope, now = new Date()) {
  await s.tx
    .update(aiUsage)
    .set({ state: "expired", settledAt: now })
    .where(and(eq(aiUsage.userId, s.userId), eq(aiUsage.state, "held"), lt(aiUsage.createdAt, new Date(now.getTime() - HELD_ROW_MAX_AGE_MS))));
}

/**
 * Settles a voice call's row when the call ends. The length comes from our own clock (the call row's creation to now), capped at what
 * was reserved plus a minute of grace; whatever the browser reported (token counts) is kept but marked as the browser's and never
 * changes the length. A repeat finds nothing held and changes nothing.
 */
export async function settleVoiceUsage(
  userId: string,
  conversationId: string,
  browser: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; error?: boolean },
  now = new Date(),
  graceSeconds = 60,
  db: Database = getDb(),
) {
  return withUser(
    userId,
    async (s) => {
      const [held] = await s.tx
        .select()
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, "voice"), eq(aiUsage.state, "held"), eq(aiUsage.conversationId, conversationId)))
        .orderBy(desc(aiUsage.createdAt))
        .limit(1)
        .for("update");
      if (!held) return null;
      const elapsed = Math.max(0, Math.round((now.getTime() - held.createdAt.getTime()) / 1000));
      const seconds = Math.min(elapsed, (held.seconds ?? elapsed) + graceSeconds);
      const reported = browser.inputTokens != null || browser.outputTokens != null;
      await s.tx
        .update(aiUsage)
        .set({
          state: browser.error ? "failed" : "settled",
          settledAt: now,
          seconds,
          usageFrom: reported ? "browser" : "server_clock",
          inputTokens: reported ? (browser.inputTokens ?? null) : null,
          cachedInputTokens: reported ? (browser.cachedInputTokens ?? null) : null,
          outputTokens: reported ? (browser.outputTokens ?? null) : null,
        })
        .where(eq(aiUsage.id, held.id));
      return { id: held.id, seconds, holdId: held.holdId };
    },
    db,
  ).then(async (done) => {
    // The minutes really used (our clock) replace what was set aside. A hold that already expired was counted in full and stays so.
    if (done?.holdId)
      await settleBudget(done.holdId, { seconds: done.seconds }, db).catch((e) => console.error("[ai-budget] settle", e instanceof Error ? e.name : typeof e));
    return done && { id: done.id, seconds: done.seconds };
  });
}
