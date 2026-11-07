import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { jarvisRuns, messages } from "../db/schema";
import type { UserScope } from "../db/with-user";

/** A turn is hard-stopped by the platform at 300 s (route maxDuration) and by its own deadline a little earlier. */
export const TURN_DEADLINE_MS = 280_000;
const STILL_RUNNING_MS = 310_000;

/**
 * Where one send stands, by the id the app made for it:
 * unknown (never saved), running (saved, no run yet, young enough that it may still be working),
 * finished (its run row exists) or stalled (saved, no run, and too old to still be working).
 */
export type TurnState = "unknown" | "running" | "finished" | "stalled";

export async function turnStateOf(
  scope: UserScope,
  clientMessageId: string,
  now = new Date(),
): Promise<{ state: TurnState; conversationId: string | null; runId: string | null }> {
  const [m] = await scope.tx
    .select({ seq: messages.seq, at: messages.createdAt, conversationId: messages.conversationId })
    .from(messages)
    .where(and(eq(messages.userId, scope.userId), eq(messages.clientMessageId, clientMessageId)))
    .limit(1);
  if (!m) return { state: "unknown", conversationId: null, runId: null };
  const [next] = await scope.tx
    .select({ at: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, m.conversationId), eq(messages.userId, scope.userId), eq(messages.role, "user"), gt(messages.seq, m.seq)))
    .orderBy(asc(messages.seq))
    .limit(1);
  const [run] = await scope.tx
    .select({ id: jarvisRuns.id })
    .from(jarvisRuns)
    .where(
      and(
        eq(jarvisRuns.conversationId, m.conversationId),
        eq(jarvisRuns.userId, scope.userId),
        gte(jarvisRuns.createdAt, m.at),
        ...(next ? [lt(jarvisRuns.createdAt, next.at)] : []),
      ),
    )
    .limit(1);
  if (run) return { state: "finished", conversationId: m.conversationId, runId: run.id };
  const young = now.getTime() - m.at.getTime() < STILL_RUNNING_MS;
  return { state: young ? "running" : "stalled", conversationId: m.conversationId, runId: null };
}
