import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users, type UserPreferences } from "../db/schema";

export const SESSION_COOKIE = "bf_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  accountKind: "standard" | "demo";
  preferences?: UserPreferences;
};

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(db: Database, userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  return { token, expiresAt };
}

/** Validates a token; slides expiry forward at most once a day. */
export async function validateSession(db: Database, token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      user: { id: users.id, email: users.email, name: users.name, timezone: users.timezone, accountKind: users.accountKind, preferences: users.preferences },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, id));
  }
  return row.user;
}

export async function deleteSession(db: Database, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(db: Database, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(db: Database) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
