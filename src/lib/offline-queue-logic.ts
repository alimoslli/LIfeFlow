/**
 * The decisions the offline queue makes, kept free of the browser so they can
 * be tested: what order to send in, what has to wait, and what a failure means.
 */
import { OFFLINE_BATCH_MAX } from "./offline-limits";

export type StoredMeta = {
  /** Creation order on this device: only ever goes up. */
  seq?: number;
  queuedAt?: number;
  /** The account that made the change. Missing on changes saved before accounts were recorded. */
  userId?: string;
  /** "failed" = the server refused it for good; kept so the person can retry or discard it. */
  state?: "pending" | "failed";
  error?: string;
  attempts?: number;
  /** Not before this time (backoff after a temporary failure). */
  nextTryAt?: number;
};
export type OpLike = { id: string; kind: string; data: Record<string, unknown> } & StoredMeta;

/** The next sequence number: above everything stored (even older rows without one) and never behind the clock. */
export function nextSeq(existing: StoredMeta[], now: number): number {
  let max = 0;
  for (const o of existing) max = Math.max(max, o.seq ?? o.queuedAt ?? 0);
  return Math.max(max + 1, now);
}

/** Creation order, not id order. */
export function orderOps<T extends OpLike>(ops: T[]): T[] {
  return [...ops].sort((a, b) => (a.seq ?? a.queuedAt ?? 0) - (b.seq ?? b.queuedAt ?? 0) || (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.id.localeCompare(b.id));
}

/** Changes of this account (old ones with no account recorded belong to whoever is signed in). */
export const ownedBy = <T extends StoredMeta>(ops: T[], userId: string) => ops.filter((o) => !o.userId || o.userId === userId);

/** Ids of earlier changes this one needs first (ticking a to-do that was created offline). */
export const dependsOn = (op: OpLike): string[] => (typeof op.data.taskId === "string" ? [op.data.taskId] : []);

/**
 * What can be sent now: this account's, in creation order, not failed, past
 * its backoff, and not waiting for an earlier change that is still stored.
 */
export function readyOps<T extends OpLike>(all: T[], userId: string, now: number, force = false): T[] {
  const mine = orderOps(ownedBy(all, userId));
  const stored = new Set(mine.map((o) => o.id));
  return mine.filter((o) => o.state !== "failed" && (force || !o.nextTryAt || o.nextTryAt <= now) && !dependsOn(o).some((id) => id !== o.id && stored.has(id)));
}

export function chunk<T>(items: T[], size = OFFLINE_BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** What a whole-request failure means for the changes in it. Nothing here ever deletes anything. */
export function classifyHttp(status: number): "retry" | "stop" {
  return status === 408 || status === 429 || status >= 500 ? "retry" : "stop"; // 401/403/409/400: keep them and wait (signed out, other account)
}

/** Waits 5 s, 10 s, 20 s … up to 15 minutes. */
export const backoffMs = (attempts: number) => Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));

export type ReplayOutcome = { id: string; status: "applied" | "already_applied" | "failed"; error?: string; retryable?: boolean };

/** Per-change result from the server: gone from the queue, tried again later, or kept as failed. */
export function applyOutcome<T extends OpLike>(op: T, r: ReplayOutcome | undefined, now: number): T | null {
  if (!r) return { ...op, attempts: (op.attempts ?? 0) + 1, nextTryAt: now + backoffMs((op.attempts ?? 0) + 1) };
  if (r.status !== "failed") return null;
  if (r.retryable) return { ...op, attempts: (op.attempts ?? 0) + 1, nextTryAt: now + backoffMs((op.attempts ?? 0) + 1) };
  return { ...op, state: "failed", error: r.error?.slice(0, 200) };
}
