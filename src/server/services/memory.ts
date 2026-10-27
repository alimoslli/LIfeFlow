import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { memories, type MemoryCategory } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { notFound, ServiceError } from "./errors";

export const MEMORY_CATEGORIES = ["preference", "goal", "routine", "project", "fact", "temporary"] as const;

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

export async function createMemory(scope: UserScope, input: z.input<typeof memoryInputSchema>, source: "user" | "jarvis") {
  const d = memoryInputSchema.parse(input);
  const reason = sensitiveContentReason(d.content);
  if (reason) throw new ServiceError(`Not saved: this ${reason}. Sensitive data is never stored in memory.`, "forbidden");
  const expiresAt = d.expiresAt ?? (d.category === "temporary" ? new Date(Date.now() + 14 * 86_400_000) : null);
  const existing = await listActiveMemories(scope);
  const dup = existing.find((m) => m.content.toLowerCase() === d.content.toLowerCase());
  if (dup) return { memory: dup, duplicate: true };
  const [row] = await scope.tx.insert(memories).values({ userId: scope.userId, content: d.content, category: d.category, source, expiresAt }).returning();
  return { memory: row, duplicate: false };
}

export async function updateMemory(scope: UserScope, id: string, patch: { content?: string; category?: MemoryCategory; expiresAt?: Date | null; status?: "active" | "archived" }) {
  if (patch.content) {
    const reason = sensitiveContentReason(patch.content);
    if (reason) throw new ServiceError(`Not saved: this ${reason}.`, "forbidden");
  }
  const [row] = await scope.tx.update(memories).set(patch).where(and(eq(memories.id, id), eq(memories.userId, scope.userId))).returning();
  if (!row) throw notFound("Memory");
  return row;
}

export async function deleteMemory(scope: UserScope, id: string) {
  const [row] = await scope.tx.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, scope.userId))).returning({ id: memories.id, content: memories.content });
  if (!row) throw notFound("Memory");
  return row;
}

/** Active, unexpired memories — what Jarvis sees. */
export async function listActiveMemories(scope: UserScope, now = new Date()) {
  return scope.tx
    .select()
    .from(memories)
    .where(and(eq(memories.userId, scope.userId), eq(memories.status, "active"), or(isNull(memories.expiresAt), gt(memories.expiresAt, now))))
    .orderBy(desc(memories.updatedAt))
    .limit(100);
}

export async function listAllMemories(scope: UserScope) {
  return scope.tx.select().from(memories).where(eq(memories.userId, scope.userId)).orderBy(desc(memories.createdAt));
}

export async function touchMemories(scope: UserScope, ids: string[]) {
  if (!ids.length) return;
  await scope.tx.update(memories).set({ lastUsedAt: new Date() }).where(and(eq(memories.userId, scope.userId), inArray(memories.id, ids)));
}
