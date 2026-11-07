import { and, asc, desc, eq, gt, gte, like, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { jarvisRuns, messages, rateLimitBuckets } from "../db/schema";
import type { UserScope } from "../db/with-user";

/** A turn is hard-stopped by the platform at 300 s (route maxDuration) and by its own deadline a little earlier. */
export const TURN_DEADLINE_MS = 280_000;
const STILL_RUNNING_MS = 310_000;

const nowSeconds = () => Math.floor(Date.now() / 1000);
const contKey = (userId: string, id: string) => `jarvis:cont:${userId}:${id}`;

/**
 * A send whose turn died is continued by exactly one request. The claim is one row per attempt (key + attempt number,
 * written with "do nothing on conflict"), so two requests arriving together cannot both win, and a continuation that
 * itself died (its claim older than a turn can run) can be claimed again by the next attempt.
 */
export async function claimContinuation(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const key = `${contKey(userId, id)}:${attempt}`;
    const won = await db
      .insert(rateLimitBuckets)
      .values({ key, windowStart: new Date(0), count: nowSeconds() })
      .onConflictDoNothing()
      .returning({ k: rateLimitBuckets.key });
    if (won.length) return true;
    const [existing] = await db.select({ at: rateLimitBuckets.count }).from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key)).limit(1);
    if (!existing || Date.now() - existing.at * 1000 < STILL_RUNNING_MS) return false;
  }
  return false;
}

async function latestClaimAt(userId: string, id: string): Promise<Date | null> {
  // The claim's time is its count (seconds): the row's window is fixed so a second claim for the same attempt collides.
  const [row] = await getDb()
    .select({ at: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(like(rateLimitBuckets.key, `${contKey(userId, id)}:%`))
    .orderBy(desc(rateLimitBuckets.count))
    .limit(1);
  return row ? new Date(row.at * 1000) : null;
}

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
  const claimed = await latestClaimAt(scope.userId, clientMessageId);
  const young = now.getTime() - (claimed ?? m.at).getTime() < STILL_RUNNING_MS;
  return { state: young ? "running" : "stalled", conversationId: m.conversationId, runId: null };
}
