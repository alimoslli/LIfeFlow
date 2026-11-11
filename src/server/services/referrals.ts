import { and, count, eq, gte, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { users, waitlistReferrals } from "../db/schema";
import { keyedHash } from "../crypto";
import type { Tx } from "../db/with-user";
import { lockQueue, moveUpOne } from "./waitlist";

/**
 * Friends who count (owner, 2026-11-11): an invite counts only after the friend's email is confirmed, and only once for
 * that email, ever. The whole credit is one transaction: the referral row (unique on the hash of the normalized email, so
 * deleting an account and signing up again with the same email credits nobody twice) and the inviter's move up one place.
 * Nothing is banked: an inviter who is already let in (or first in line) keeps their place, but the friend is still recorded.
 */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * The key a friend's email is counted under, so aliases of one inbox count once (the stored email is never changed):
 * lower case, "+tag" removed on every domain, dots removed in the local part and googlemail.com read as gmail.com for Gmail.
 */
export function referralEmailKey(email: string): string {
  const [rawLocal, rawDomain = ""] = normalizeEmail(email).split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local || rawLocal}@${domain}`;
}

/** The unique, keyed (HMAC) hash stored for a friend's email: never guessable offline from the table. */
export const emailHash = (email: string) => keyedHash("waitlist-referral-email", referralEmailKey(email));

/** Moves one inviter can earn in a day (a rolling 24 hours); more friends are still recorded, without a move. */
export const MAX_CREDITS_PER_DAY = 10;

export type Credit = { recorded: boolean; moved: boolean };
export type VerifyResult = Credit & { verified: boolean };

/**
 * Marks the account's email as confirmed (the first time only; a repeat changes nothing) and, when this friend came from
 * someone's link, credits that person in the same transaction. Pass a transaction to keep other steps (like taking the
 * code) in it too.
 */
export async function verifyEmail(db: Database | Tx, userId: string, now = new Date()): Promise<VerifyResult> {
  return db.transaction(async (tx) => {
    // The queue lock comes before any row lock below (see lockQueue), so confirmations at the same moment queue up instead of deadlocking.
    await lockQueue(tx);
    // Only the request that flips null to a time goes on to credit; a second one at the same moment waits on the row, then finds it set.
    const [flipped] = await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
      .returning({ id: users.id });
    if (!flipped) {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      return { verified: !!u, recorded: false, moved: false };
    }
    return { verified: true, ...(await creditReferral(tx, userId, now)) };
  });
}

/**
 * Records this (already verified) friend's referral and moves the inviter up one place, once. No self-referral, no demo
 * account on either side, and the inviter must still exist. Run it inside a transaction.
 */
export async function creditReferral(tx: Tx, inviteeId: string, now = new Date()): Promise<Credit> {
  await lockQueue(tx);
  const none = { recorded: false, moved: false };
  const [me] = await tx
    .select({ email: users.email, kind: users.accountKind, by: users.invitedBy, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, inviteeId));
  if (!me || !me.by || !me.verifiedAt || me.kind !== "standard" || me.by === inviteeId) return none;
  const [inviter] = await tx.select({ id: users.id, email: users.email, kind: users.accountKind }).from(users).where(eq(users.id, me.by));
  if (!inviter || inviter.kind !== "standard") return none;
  const hash = emailHash(me.email);
  if (hash === emailHash(inviter.email)) return none;
  // The unique hash decides, even when two confirmations (or a deleted and re-made account) arrive together.
  // Over the daily cap the friend is recorded without being credited (and without a move), so it can't be retried for one.
  const [{ n: today }] = await tx
    .select({ n: count() })
    .from(waitlistReferrals)
    .where(and(eq(waitlistReferrals.inviterId, inviter.id), gte(waitlistReferrals.creditedAt, new Date(now.getTime() - 24 * 3600_000))));
  const capped = today >= MAX_CREDITS_PER_DAY;
  const inserted = await tx
    .insert(waitlistReferrals)
    .values({ inviterId: inviter.id, inviteeId, inviteeEmailHash: hash, creditedAt: capped ? null : now })
    .onConflictDoNothing({ target: waitlistReferrals.inviteeEmailHash })
    .returning({ id: waitlistReferrals.id });
  if (!inserted.length) return none;
  // Moves only someone still waiting; an inviter already let in, or first in line, stays put.
  return { recorded: true, moved: capped ? false : await moveUpOne(tx, inviter.id) };
}
