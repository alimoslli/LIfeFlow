import { and, count, eq, gte, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { adminActions, referralFingerprints, users, waitlistReferrals } from "../db/schema";
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

/** Real moves one inviter can earn in a day (a rolling 24 hours; friends who moved nobody don't count); more friends are still recorded, without a move or a count. */
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
    // The queue lock comes before any row lock (see lockQueue), here and in confirmEmailCode, which takes it before it touches the code row, so confirmations at the same moment queue up instead of deadlocking.
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
  const [inviter] = await tx
    .select({ id: users.id, email: users.email, kind: users.accountKind, prefs: users.preferences })
    .from(users)
    .where(eq(users.id, me.by));
  // an inviter the under-13 lock closed has left the queue and keeps nothing, so nobody is credited to them
  if (!inviter || inviter.kind !== "standard" || inviter.prefs.ageBlockedAt) return none;
  const hash = emailHash(me.email);
  if (hash === emailHash(inviter.email)) return none;
  // A friend who deleted their account earlier left only this fingerprint: the same address can't earn a second credit.
  const [seen] = await tx.select({ hash: referralFingerprints.hash }).from(referralFingerprints).where(eq(referralFingerprints.hash, hash));
  if (seen) return none;
  // The unique hash decides, even when two confirmations (or a deleted and re-made account) arrive together.
  // Over the daily cap the friend is recorded without being credited (and without a move), so it can't be retried for one.
  const [{ n: today }] = await tx
    .select({ n: count() })
    .from(waitlistReferrals)
    .where(and(eq(waitlistReferrals.inviterId, inviter.id), gte(waitlistReferrals.movedAt, new Date(now.getTime() - 24 * 3600_000))));
  const capped = today >= MAX_CREDITS_PER_DAY;
  const inserted = await tx
    .insert(waitlistReferrals)
    .values({ inviterId: inviter.id, inviteeId, inviteeEmailHash: hash, creditedAt: capped ? null : now })
    .onConflictDoNothing({ target: waitlistReferrals.inviteeEmailHash })
    .returning({ id: waitlistReferrals.id });
  if (!inserted.length) return none;
  // Moves only someone still waiting; an inviter already let in, or first in line, stays put.
  if (capped) return { recorded: true, moved: false };
  const moved = await moveUpOne(tx, inviter.id);
  if (moved) await tx.update(waitlistReferrals).set({ movedAt: now }).where(eq(waitlistReferrals.id, inserted[0].id));
  return { recorded: true, moved };
}

/**
 * On deleting an account: the owner's action log keeps its rows about that person (and their `target_user_id`), but the
 * plain email in them is replaced by the same one-way keyed fingerprint kept for the referral rule. Run it in the deletion
 * transaction, after the last row about them is written (the deletion row itself is included).
 */
export async function fingerprintAdminLogEmail(tx: Tx, userId: string, email: string) {
  await tx
    .update(adminActions)
    .set({ targetEmail: emailHash(email) })
    .where(eq(adminActions.targetUserId, userId));
}

/**
 * On a friend's deletion (their own or the owner's): their referral row goes, and only its one-way fingerprint stays
 * (owner, 2026-11-11), so the same address can't earn a second credit. No inviter link, no dates. The inviter's count for this
 * friend drops; the place they already moved up stays. An under-13 lock does not call this: it keeps nothing, not even this.
 */
export async function forgetFriend(tx: Tx, userId: string) {
  const rows = await tx.select({ hash: waitlistReferrals.inviteeEmailHash }).from(waitlistReferrals).where(eq(waitlistReferrals.inviteeId, userId));
  if (rows.length) await tx.insert(referralFingerprints).values(rows).onConflictDoNothing();
  await tx.delete(waitlistReferrals).where(eq(waitlistReferrals.inviteeId, userId));
}
