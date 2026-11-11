import { randomBytes } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";

/**
 * Invite links: each person gets one link (/?invite=<code>). Someone who signs up
 * from it is recorded as invited by them, so they can see how many friends joined.
 * The code is random and not secret; it only reveals the inviter's first name.
 */

// No 0/o/1/l/i, so a code read aloud or typed by hand comes out right.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_RE = /^[a-z0-9]{6,16}$/;

/** The code in lower case when it has the right shape, else null (carried through Google and Apple sign-up). */
export function validInviteCode(code: string | null | undefined): string | null {
  const clean = (code ?? "").trim().toLowerCase();
  return CODE_RE.test(clean) ? clean : null;
}

export function newInviteCode() {
  return Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/** This person's invite code, made on first use. */
export async function inviteCodeFor(db: Database, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [u] = await db.select({ code: users.inviteCode }).from(users).where(eq(users.id, userId));
    if (!u) throw new Error("No such user");
    if (u.code) return u.code;
    try {
      const [row] = await db
        .update(users)
        .set({ inviteCode: newInviteCode() })
        .where(and(eq(users.id, userId), isNull(users.inviteCode)))
        .returning({ code: users.inviteCode });
      if (row?.code) return row.code;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("Couldn't make an invite code");
}

/** Who a code belongs to (first name only), or null for an unknown code or a demo account. */
export async function inviterFor(db: Database, code: string): Promise<{ id: string; firstName: string } | null> {
  const clean = code.trim().toLowerCase();
  if (!CODE_RE.test(clean)) return null;
  const [u] = await db.select({ id: users.id, name: users.name, kind: users.accountKind }).from(users).where(eq(users.inviteCode, clean));
  if (!u || u.kind === "demo") return null;
  return { id: u.id, firstName: u.name.split(" ")[0] };
}

/** Records who invited a new account. Ignores unknown codes, self-invites and accounts already credited. */
export async function recordInvite(db: Database, newUserId: string, code: string): Promise<boolean> {
  const inviter = await inviterFor(db, code);
  if (!inviter || inviter.id === newUserId) return false;
  const rows = await db
    .update(users)
    .set({ invitedBy: inviter.id })
    .where(and(eq(users.id, newUserId), isNull(users.invitedBy)))
    .returning({ id: users.id });
  return rows.length > 0;
}

/** How many people signed up with this person's link. */
export async function invitedCount(db: Database, userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(users).where(eq(users.invitedBy, userId));
  return r?.n ?? 0;
}
