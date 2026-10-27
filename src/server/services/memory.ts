import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { memories, type MemoryBasis, type MemoryCategory, type MemoryStatus } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { notFound, ServiceError } from "./errors";

/**
 * Personal memory.
 *
 * Jarvis never decides on its own what is true about the user. It can only
 * *suggest* a memory, which stays `proposed` (and invisible to the model)
 * until the user approves it. The one exception is when the user's own
 * message explicitly asks to remember something — checked here on the
 * server against the user's text, not taken from the model's word.
 */

export const MEMORY_CATEGORIES = ["preference", "goal", "routine", "project", "fact", "temporary", "instruction"] as const;

/** At most this many suggestions wait for approval at once (prevents nagging). */
export const MAX_PENDING_SUGGESTIONS = 10;
/** A dismissed suggestion isn't suggested again for this long. */
const DISMISSAL_MEMORY_MS = 180 * 86_400_000;
const TEMPORARY_DEFAULT_MS = 14 * 86_400_000;

export const memoryInputSchema = z.object({
  content: z.string().trim().min(3).max(500),
  category: z.enum(MEMORY_CATEGORIES),
  /** Required for 'temporary' memories; optional otherwise. */
  expiresAt: z.coerce.date().nullish(),
});

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Returns a reason when text looks like a secret or highly sensitive
 * identifier that should never be stored in assistant memory.
 */
export function sensitiveContentReason(text: string): string | null {
  if (/\b(sk|pk|rk)[-_][a-z0-9_-]{16,}/i.test(text) || /\b(api[_ -]?key|secret|token)\b\s*[:=]?\s*\S{12,}/i.test(text)) return "looks like an API key or token";
  if (/\bpass(word|code|phrase)?\b\s*(is|:|=)/i.test(text) || /\bpin\s*(is|:)\s*\d{3,}/i.test(text)) return "looks like a password or PIN";
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text) || /\bssn\b/i.test(text)) return "looks like a Social Security number";
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) if (luhn(m[0].replace(/\D/g, ""))) return "looks like a card number";
  if (/\b(routing|account)\s*(number|no\.?|#)\s*(is|:)?\s*\d{6,}/i.test(text)) return "looks like a bank account number";
  return null;
}

function assertNotSensitive(text: string) {
  const reason = sensitiveContentReason(text);
  if (reason) throw new ServiceError(`Not saved: this ${reason}. Sensitive data is never stored in memory.`, "forbidden");
}

// ---------------------------------------------------------------------------
// Explicit requests and similarity

/** Questions and statements that mention remembering without asking for it. */
const NOT_A_REQUEST = [
  /\b(do|did|does)\s+(you|he|she|they)\s+(still\s+|even\s+)?remember\b[^.!?\n]*\??/gi,
  /\b(i|we)\s+(don'?t\s+|do\s+not\s+|can'?t\s+|cannot\s+|couldn'?t\s+|never\s+|always\s+|just\s+)?(remember|forget)\b/gi,
  /\b(don'?t|do\s+not|didn'?t|did\s+not|can'?t|cannot)\s+remember\b/gi,
];

const REQUEST = [
  /^\s*(ok(ay)?[,!.]?\s+|hey[,!.]?\s+|jarvis[,!.:]?\s+)*(please\s+)?(remember|memori[sz]e|note|keep in mind)\b/i,
  /\b(please|pls|can\s+you|could\s+you|would\s+you|will\s+you|i\s+want\s+you\s+to|i'?d\s+like\s+you\s+to)\s+(please\s+)?(always\s+)?(remember|memori[sz]e|keep\s+in\s+mind|note)\b/i,
  /\b(don'?t|do\s+not)\s+forget\b/i,
  /\bkeep\s+(that|this|it)?\s*in\s+mind\b/i,
  /\b(make|take)\s+a\s+note\b/i,
  /\b(save|add|put|store|keep)\s+(this|that|it)?\s*(to|in|into)\s+(your\s+)?memory\b/i,
  /\b(update|change|correct|fix|edit)\s+(your|the|my|that)\s+memory\b/i,
  /\b(for\s+future\s+reference|from\s+now\s+on)\b/i,
  /[.!;,]\s*(please\s+)?remember\s+(that|this|it)\b/i,
];

/**
 * True when the user's own message explicitly asks Jarvis to remember (or
 * update what it remembers). Only then is a memory saved without a separate
 * approval tap. Deliberately conservative: unclear cases become suggestions.
 */
export function explicitMemoryRequest(userText: string): boolean {
  let text = userText;
  for (const re of NOT_A_REQUEST) text = text.replace(re, " ");
  return REQUEST.some((re) => re.test(text));
}

const STOP = new Set(["a", "an", "the", "and", "or", "to", "of", "in", "on", "at", "for", "is", "are", "be", "i", "my", "me", "user", "user's", "they", "their", "s"]);

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s$]/gu, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

/** Same memory, possibly reworded slightly ("Prefers mornings" vs "prefers mornings."). */
export function similarContent(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (!ta.size || !tb.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  return Math.min(ta.size, tb.size) < 3 ? jaccard === 1 : jaccard >= 0.8;
}

// ---------------------------------------------------------------------------
// Reads

/** Active, approved, unexpired memories — the only ones Jarvis may use. */
export async function listActiveMemories(scope: UserScope, now = new Date()) {
  return scope.tx
    .select()
    .from(memories)
    .where(and(eq(memories.userId, scope.userId), eq(memories.status, "active"), or(isNull(memories.expiresAt), gt(memories.expiresAt, now))))
    .orderBy(desc(memories.updatedAt))
    .limit(500);
}

export async function listProposedMemories(scope: UserScope) {
  return scope.tx
    .select()
    .from(memories)
    .where(and(eq(memories.userId, scope.userId), eq(memories.status, "proposed")))
    .orderBy(desc(memories.createdAt));
}

export async function listAllMemories(scope: UserScope) {
  return scope.tx.select().from(memories).where(eq(memories.userId, scope.userId)).orderBy(desc(memories.createdAt));
}

export async function getMemory(scope: UserScope, id: string) {
  const [row] = await scope.tx.select().from(memories).where(and(eq(memories.id, id), eq(memories.userId, scope.userId)));
  if (!row) throw notFound("Memory");
  return row;
}

/** Current status of the given memories (for rendering suggestion cards). */
export async function memoryStatuses(scope: UserScope, ids: string[]): Promise<Map<string, MemoryStatus>> {
  if (!ids.length) return new Map();
  const rows = await scope.tx
    .select({ id: memories.id, status: memories.status })
    .from(memories)
    .where(and(eq(memories.userId, scope.userId), inArray(memories.id, ids)));
  return new Map(rows.map((r) => [r.id, r.status]));
}

export async function touchMemories(scope: UserScope, ids: string[]) {
  if (!ids.length) return;
  await scope.tx.update(memories).set({ lastUsedAt: new Date() }).where(and(eq(memories.userId, scope.userId), inArray(memories.id, ids)));
}

// ---------------------------------------------------------------------------
// Writes by the user (Settings, seed)

/** The user adds a memory themselves: active and confirmed immediately. */
export async function createMemory(scope: UserScope, input: z.input<typeof memoryInputSchema>, source: "user" | "jarvis") {
  const d = memoryInputSchema.parse(input);
  assertNotSensitive(d.content);
  const existing = await listActiveMemories(scope);
  const dup = existing.find((m) => similarContent(m.content, d.content));
  if (dup) return { memory: dup, duplicate: true };
  const expiresAt = d.expiresAt ?? (d.category === "temporary" ? new Date(Date.now() + TEMPORARY_DEFAULT_MS) : null);
  const [row] = await scope.tx
    .insert(memories)
    .values({ userId: scope.userId, content: d.content, category: d.category, source, basis: "stated", status: "active", confirmedAt: new Date(), expiresAt })
    .returning();
  return { memory: row, duplicate: false };
}

/** The user edits a memory. Their wording becomes the confirmed version. */
export async function editMemory(scope: UserScope, id: string, patch: { content?: string; category?: MemoryCategory; expiresAt?: Date | null }) {
  const current = await getMemory(scope, id);
  if (current.status === "rejected") throw new ServiceError("Dismissed suggestions can't be edited. Add it as a new memory instead.", "conflict");
  const content = patch.content?.trim();
  if (content !== undefined) {
    if (content.length < 3 || content.length > 500) throw new ServiceError("A memory must be 3–500 characters.", "invalid");
    assertNotSensitive(content);
  }
  const [row] = await scope.tx
    .update(memories)
    .set({ ...patch, ...(content !== undefined && { content }), basis: "stated", confirmedAt: new Date() })
    .where(and(eq(memories.id, id), eq(memories.userId, scope.userId)))
    .returning();
  return row;
}

/** Archive (Jarvis stops using it, restorable) or restore. */
export async function setMemoryStatus(scope: UserScope, id: string, status: "active" | "archived") {
  const current = await getMemory(scope, id);
  if (current.status === "proposed" || current.status === "rejected") throw new ServiceError("Approve or dismiss the suggestion instead.", "conflict");
  const [row] = await scope.tx
    .update(memories)
    .set({ status, ...(status === "active" && !current.confirmedAt && { confirmedAt: new Date() }) })
    .where(and(eq(memories.id, id), eq(memories.userId, scope.userId)))
    .returning();
  return row;
}

export async function deleteMemory(scope: UserScope, id: string) {
  const [row] = await scope.tx.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, scope.userId))).returning({ id: memories.id, content: memories.content });
  if (!row) throw notFound("Memory");
  return row;
}

/** The user approves a suggestion. Approving a correction archives what it replaces. */
export async function approveMemory(scope: UserScope, id: string, now = new Date()) {
  const current = await getMemory(scope, id);
  if (current.status !== "proposed") throw new ServiceError(`This suggestion was already ${current.status === "active" ? "saved" : current.status === "rejected" ? "dismissed" : current.status}.`, "conflict");
  const [row] = await scope.tx.update(memories).set({ status: "active", confirmedAt: now }).where(and(eq(memories.id, id), eq(memories.userId, scope.userId))).returning();
  let replaced: { id: string; content: string } | null = null;
  if (current.supersedesId) {
    const [old] = await scope.tx
      .update(memories)
      .set({ status: "archived" })
      .where(and(eq(memories.id, current.supersedesId), eq(memories.userId, scope.userId), eq(memories.status, "active")))
      .returning({ id: memories.id, content: memories.content });
    replaced = old ?? null;
  }
  return { memory: row, replaced };
}

/** The user dismisses a suggestion. It's kept as `rejected` so it isn't suggested again. */
export async function dismissMemory(scope: UserScope, id: string) {
  const current = await getMemory(scope, id);
  if (current.status !== "proposed") throw new ServiceError(`This suggestion was already ${current.status === "active" ? "saved" : current.status}.`, "conflict");
  const [row] = await scope.tx.update(memories).set({ status: "rejected" }).where(and(eq(memories.id, id), eq(memories.userId, scope.userId))).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Writes by Jarvis

export type JarvisMemoryContext = {
  /** The user's own message for this turn (never tool output). */
  userText: string;
  conversationId: string | null;
  /** The user's "let Jarvis suggest memories" setting. */
  suggestionsEnabled: boolean;
  now: Date;
};

export type RememberStatus = "saved" | "proposed" | "already_known" | "already_suggested" | "previously_dismissed" | "suggestions_off" | "too_many_pending";

export type RememberResult = { status: RememberStatus; memory: typeof memories.$inferSelect | null };

/**
 * Jarvis wants to remember something. Saved immediately only when the user
 * explicitly asked and it's something they said; otherwise it becomes a
 * suggestion the user approves or dismisses.
 */
export async function rememberForUser(
  scope: UserScope,
  input: z.input<typeof memoryInputSchema> & { basis: MemoryBasis },
  ctx: JarvisMemoryContext,
): Promise<RememberResult> {
  const d = memoryInputSchema.parse(input);
  assertNotSensitive(d.content);
  const explicit = input.basis === "stated" && explicitMemoryRequest(ctx.userText);

  const others = await scope.tx
    .select()
    .from(memories)
    .where(and(eq(memories.userId, scope.userId), inArray(memories.status, ["active", "proposed", "rejected"])));
  const same = others.filter((m) => similarContent(m.content, d.content) && (!m.expiresAt || m.expiresAt > ctx.now));
  const active = same.find((m) => m.status === "active");
  if (active) return { status: "already_known", memory: active };
  const pending = same.find((m) => m.status === "proposed");
  if (pending && !explicit) return { status: "already_suggested", memory: pending };
  const dismissed = same.find((m) => m.status === "rejected" && ctx.now.getTime() - m.updatedAt.getTime() < DISMISSAL_MEMORY_MS);
  if (dismissed && !explicit) return { status: "previously_dismissed", memory: null };

  const expiresAt = d.expiresAt ?? (d.category === "temporary" ? new Date(ctx.now.getTime() + TEMPORARY_DEFAULT_MS) : null);
  if (explicit) {
    if (pending) {
      const r = await approveMemory(scope, pending.id, ctx.now);
      return { status: "saved", memory: r.memory };
    }
    const [row] = await scope.tx
      .insert(memories)
      .values({ userId: scope.userId, content: d.content, category: d.category, source: "jarvis", basis: "stated", status: "active", confirmedAt: ctx.now, conversationId: ctx.conversationId, expiresAt })
      .returning();
    return { status: "saved", memory: row };
  }

  if (!ctx.suggestionsEnabled) return { status: "suggestions_off", memory: null };
  if (others.filter((m) => m.status === "proposed").length >= MAX_PENDING_SUGGESTIONS) return { status: "too_many_pending", memory: null };
  const [row] = await scope.tx
    .insert(memories)
    .values({ userId: scope.userId, content: d.content, category: d.category, source: "jarvis", basis: input.basis, status: "proposed", conversationId: ctx.conversationId, expiresAt })
    .returning();
  return { status: "proposed", memory: row };
}

export type CorrectionResult = { status: "updated" | "proposed" | "unchanged" | "suggestions_off"; memory: typeof memories.$inferSelect | null; replaces: { id: string; content: string } };

/**
 * Jarvis corrects an existing memory. The old version is kept (archived)
 * so the change can be undone. Applied directly only on an explicit request.
 */
export async function correctMemoryForUser(
  scope: UserScope,
  id: string,
  patch: { content: string; category?: MemoryCategory; expiresAt?: Date | null },
  ctx: JarvisMemoryContext,
): Promise<CorrectionResult> {
  const old = await getMemory(scope, id);
  if (old.status !== "active") throw new ServiceError("Only memories currently in use can be corrected.", "conflict");
  const d = memoryInputSchema.parse({ content: patch.content, category: patch.category ?? old.category, expiresAt: patch.expiresAt === undefined ? old.expiresAt : patch.expiresAt });
  assertNotSensitive(d.content);
  const replaces = { id: old.id, content: old.content };
  if (d.content === old.content && d.category === old.category) return { status: "unchanged", memory: old, replaces };

  if (explicitMemoryRequest(ctx.userText)) {
    const [row] = await scope.tx
      .insert(memories)
      .values({ userId: scope.userId, content: d.content, category: d.category, source: "jarvis", basis: "stated", status: "active", confirmedAt: ctx.now, supersedesId: old.id, conversationId: ctx.conversationId, expiresAt: d.expiresAt ?? null })
      .returning();
    await scope.tx.update(memories).set({ status: "archived" }).where(and(eq(memories.id, old.id), eq(memories.userId, scope.userId)));
    return { status: "updated", memory: row, replaces };
  }
  if (!ctx.suggestionsEnabled) return { status: "suggestions_off", memory: null, replaces };
  const [row] = await scope.tx
    .insert(memories)
    .values({ userId: scope.userId, content: d.content, category: d.category, source: "jarvis", basis: "stated", status: "proposed", supersedesId: old.id, conversationId: ctx.conversationId, expiresAt: d.expiresAt ?? null })
    .returning();
  return { status: "proposed", memory: row, replaces };
}
