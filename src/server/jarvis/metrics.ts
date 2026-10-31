import { and, eq, gte, sql } from "drizzle-orm";
import { jarvisRuns, type JarvisRunOutcome } from "../db/schema";
import type { UserScope } from "../db/with-user";
import type { TokenUsage } from "./providers/types";

export type ModelPrices = { inputPerMTok?: number; cachedInputPerMTok?: number; outputPerMTok?: number };

export function addUsage(a: TokenUsage | null, b: TokenUsage | undefined): TokenUsage | null {
  if (!b) return a;
  if (!a) return { ...b };
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}

/**
 * Estimated cost in millionths of a dollar. Prices are $/1M tokens, so
 * tokens × price is exactly micro-dollars. Cached input falls back to the
 * input price; reasoning tokens are already counted in output tokens.
 * Returns null when prices are unknown, so cost is never invented.
 */
export function estimateCostMicros(usage: TokenUsage | null, p: ModelPrices): number | null {
  if (!usage || p.inputPerMTok == null || p.outputPerMTok == null) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const cachedPrice = p.cachedInputPerMTok ?? p.inputPerMTok;
  return Math.round((usage.inputTokens - cached) * p.inputPerMTok + cached * cachedPrice + usage.outputTokens * p.outputPerMTok);
}

/** Coarse, content-free failure class for metrics. */
export function errorKindOf(e: unknown, aborted: boolean): string {
  if (aborted) return "cancelled";
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 404) return "model_not_found";
  if (status && status >= 500) return "provider_5xx";
  if (status && status >= 400) return "provider_4xx";
  const msg = e instanceof Error ? e.message : "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timed out/i.test(msg)) return "network";
  return "internal";
}

export type RunRecord = {
  conversationId: string;
  messageId: string | null;
  provider: string;
  model: string | null;
  promptVersion: string;
  outcome: JarvisRunOutcome;
  errorKind: string | null;
  latencyMs: number;
  firstTokenMs: number | null;
  steps: number;
  toolCalls: number;
  toolErrors: number;
  confirmations: number;
  toolNames: string[];
  usage: TokenUsage | null;
  costMicros: number | null;
  memoryIds: string[];
  /** Skills routed for this turn. */
  skills?: string[];
};

export async function recordRun(scope: UserScope, r: RunRecord) {
  const [row] = await scope.tx
    .insert(jarvisRuns)
    .values({
      userId: scope.userId,
      conversationId: r.conversationId,
      messageId: r.messageId,
      provider: r.provider,
      model: r.model,
      promptVersion: r.promptVersion,
      outcome: r.outcome,
      errorKind: r.errorKind,
      latencyMs: Math.round(r.latencyMs),
      firstTokenMs: r.firstTokenMs == null ? null : Math.round(r.firstTokenMs),
      steps: r.steps,
      toolCalls: r.toolCalls,
      toolErrors: r.toolErrors,
      confirmations: r.confirmations,
      toolNames: [...new Set(r.toolNames)],
      inputTokens: r.usage?.inputTokens ?? null,
      cachedInputTokens: r.usage?.cachedInputTokens ?? null,
      outputTokens: r.usage?.outputTokens ?? null,
      reasoningTokens: r.usage?.reasoningTokens ?? null,
      costMicros: r.costMicros,
      memoryIds: r.memoryIds,
      skills: r.skills ?? [],
    })
    .returning({ id: jarvisRuns.id });
  return row.id;
}

export type JarvisStats = {
  runs: number;
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  medianFirstTokenMs: number | null;
  failedRuns: number;
  toolCalls: number;
  toolErrors: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Sum over runs that had a price; null if none did. */
  costMicros: number | null;
  pricedRuns: number;
};

/** The signed-in user's own Jarvis metrics over the last `days` days. */
export async function jarvisStats(scope: UserScope, days = 30, now = new Date()): Promise<JarvisStats> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [r] = await scope.tx
    .select({
      runs: sql<number>`count(*)::int`,
      medianLatencyMs: sql<number | null>`percentile_cont(0.5) within group (order by ${jarvisRuns.latencyMs})`,
      p90LatencyMs: sql<number | null>`percentile_cont(0.9) within group (order by ${jarvisRuns.latencyMs})`,
      medianFirstTokenMs: sql<number | null>`percentile_cont(0.5) within group (order by ${jarvisRuns.firstTokenMs})`,
      failedRuns: sql<number>`count(*) filter (where ${jarvisRuns.outcome} = 'error')::int`,
      toolCalls: sql<number>`coalesce(sum(${jarvisRuns.toolCalls}), 0)::int`,
      toolErrors: sql<number>`coalesce(sum(${jarvisRuns.toolErrors}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${jarvisRuns.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${jarvisRuns.outputTokens}), 0)::bigint`,
      cachedInputTokens: sql<number>`coalesce(sum(${jarvisRuns.cachedInputTokens}), 0)::bigint`,
      costMicros: sql<number | null>`sum(${jarvisRuns.costMicros})`,
      pricedRuns: sql<number>`count(${jarvisRuns.costMicros})::int`,
    })
    .from(jarvisRuns)
    .where(and(eq(jarvisRuns.userId, scope.userId), gte(jarvisRuns.createdAt, since)));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    runs: r.runs,
    medianLatencyMs: num(r.medianLatencyMs),
    p90LatencyMs: num(r.p90LatencyMs),
    medianFirstTokenMs: num(r.medianFirstTokenMs),
    failedRuns: r.failedRuns,
    toolCalls: r.toolCalls,
    toolErrors: r.toolErrors,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    cachedInputTokens: Number(r.cachedInputTokens),
    costMicros: num(r.costMicros),
    pricedRuns: r.pricedRuns,
  };
}

/** 👍 / 👎 on one of Jarvis's answers (the user's own runs only). Feeds the per-skill stats. */
export async function rateRun(scope: UserScope, runId: string, rating: 1 | -1 | null) {
  const [row] = await scope.tx
    .update(jarvisRuns)
    .set({ rating })
    .where(and(eq(jarvisRuns.id, runId), eq(jarvisRuns.userId, scope.userId)))
    .returning({ id: jarvisRuns.id });
  return !!row;
}

/** Per-skill usage, success and ratings, for the debug screen. A skill is flagged when answers using it are rated down often. */
export async function skillStats(scope: UserScope, days = 90, now = new Date()) {
  const rows = await scope.tx
    .select({ skills: jarvisRuns.skills, outcome: jarvisRuns.outcome, rating: jarvisRuns.rating, toolErrors: jarvisRuns.toolErrors })
    .from(jarvisRuns)
    .where(and(eq(jarvisRuns.userId, scope.userId), gte(jarvisRuns.createdAt, new Date(now.getTime() - days * 86_400_000))));
  const by = new Map<string, { runs: number; ok: number; up: number; down: number; toolErrors: number }>();
  for (const r of rows)
    for (const k of r.skills.length ? r.skills : ["(no skill)"]) {
      const x = by.get(k) ?? { runs: 0, ok: 0, up: 0, down: 0, toolErrors: 0 };
      x.runs++;
      if (r.outcome === "ok") x.ok++;
      if (r.rating === 1) x.up++;
      if (r.rating === -1) x.down++;
      x.toolErrors += r.toolErrors;
      by.set(k, x);
    }
  return [...by.entries()]
    .map(([skill, x]) => ({ skill, ...x, successRate: x.runs ? x.ok / x.runs : null, flagged: x.down >= 2 && x.down > x.up }))
    .sort((a, b) => b.runs - a.runs);
}

/** How many times the user has asked Jarvis something (all time). Used to stop "Try this" tips once they're a regular. */
export async function runCount(scope: UserScope) {
  const [r] = await scope.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(jarvisRuns)
    .where(eq(jarvisRuns.userId, scope.userId));
  return r?.n ?? 0;
}
