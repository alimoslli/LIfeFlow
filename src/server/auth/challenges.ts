import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { authChallenges } from "../db/schema";

/**
 * Single-use, short-lived server challenges (passkeys, Sign in with Apple).
 * The browser keeps a random token in an httpOnly cookie; the database keeps
 * only its hash, the challenge and who it's for. Taking a challenge deletes it,
 * so a response can never be replayed.
 */

export type ChallengePurpose = (typeof authChallenges.$inferSelect)["purpose"];

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function saveChallenge(db: Database, purpose: ChallengePurpose, challenge: string, userId: string | null, ttlMs = 5 * 60_000) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(authChallenges).values({ id: hash(token), purpose, challenge, userId, expiresAt });
  // Housekeeping: expired challenges are useless.
  if (Math.random() < 0.1) await db.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date()));
  return { token, expiresAt };
}

/** Returns and deletes the challenge, or null if it's unknown, used, expired or for something else. */
export async function takeChallenge(db: Database, purpose: ChallengePurpose, token: string | undefined | null) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .delete(authChallenges)
    .where(and(eq(authChallenges.id, hash(token)), eq(authChallenges.purpose, purpose), gt(authChallenges.expiresAt, new Date())))
    .returning();
  return row ? { challenge: row.challenge, userId: row.userId } : null;
}
