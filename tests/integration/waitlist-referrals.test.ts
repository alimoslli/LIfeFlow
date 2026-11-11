import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { completeAppleSignIn, parseAppleState, startAppleSignIn } from "@/server/auth/apple";
import { takeChallenge } from "@/server/auth/challenges";
import { completeGoogleSignIn, parseGoogleState, startGoogleSignIn } from "@/server/auth/google-signin";
import { closeDb, getDb } from "@/server/db/client";
import { emailConfirmations, rateLimitBuckets, users, waitlistReferrals } from "@/server/db/schema";
import {
  confirmEmailCode,
  CONFIRM_CODE_TTL_MS,
  CONFIRM_SENDS_PER_IP_HOUR,
  CONFIRM_TRIES_PER_IP_15MIN,
  purgeExpiredConfirmCodes,
  sendConfirmCode,
} from "@/server/services/email-confirm";
import { inviteCodeFor, recordInvite, validInviteCode } from "@/server/services/invites";
import { creditReferral, emailHash, MAX_CREDITS_PER_DAY, referralEmailKey, verifyEmail } from "@/server/services/referrals";
import { saveWelcomeProgress } from "@/server/services/onboarding";
import { deleteAccount } from "@/server/services/accounts";
import { acceptUsers, lockQueue, moveUpOne, nextInLine, waitingCount, waitlistPage, waitlistPlace } from "@/server/services/waitlist";
import { inviterFor } from "@/server/services/invites";
import { makeUser as makeAnyUser } from "../helpers";

const db = getDb();
const made: string[] = [];
const makeUser = async (name?: string) => {
  const m = await makeAnyUser(name);
  made.push(m.user.id);
  return m;
};
// These tests invite people; take them (and anyone invited by them) out afterwards so other tests' rankings of inviters aren't crowded.
afterAll(async () => {
  await db.delete(users).where(inArray(users.invitedBy, made));
  await db.delete(users).where(inArray(users.id, made));
  await closeDb();
});
/** Codes are fixed in these tests, so no check ever has to skip a case where two random codes happen to match. */
const RIGHT = "123456";
const WRONG = "654321";
const fixed = (c = RIGHT) => ({ code: () => c });
const CFG = { apiKey: "test", from: "LifeFlow <test@example.com>" };
const place = (id: string) => waitlistPlace(db, id);
/** Fills a rate-limit bucket to its limit for the current window, so a limit can be tested without making hundreds of calls. */
async function fillBucket(key: string, count: number, windowSeconds: number) {
  const ms = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / ms) * ms);
  await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count })
    .onConflictDoUpdate({ target: [rateLimitBuckets.key, rateLimitBuckets.windowStart], set: { count } });
}
const newIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Everyone already in the test database is let in, so places count only the people a test makes. */
async function clearLine() {
  await db.update(users).set({ access: "in" }).where(eq(users.access, "waiting"));
}

/** An inviter at place 2 (a filler is first) and a friend who signed up from their link. */
async function inviterAndFriend() {
  await clearLine();
  const first = (await makeUser("First")).user;
  const inviter = (await makeUser("Inviter")).user;
  const friend = (await makeUser("Friend")).user;
  expect(await recordInvite(db, friend.id, await inviteCodeFor(db, inviter.id))).toBe(true);
  return { first, inviter, friend };
}

/** A sender that records what would be emailed (never a real send). */
function outbox(id: string | null = "msg_1") {
  const sent: { to: string; subject: string; text: string }[] = [];
  const send = async (_cfg: unknown, m: { to: string; subject: string; text: string }) => {
    sent.push(m);
    return { id: id as string };
  };
  const code = () => /\b(\d{6})\b/.exec(sent[sent.length - 1].text)![1];
  return { sent, send, code };
}

describe("confirm your email: the code", () => {
  it("sends only with the provider's id, then confirms once", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    const out = outbox();
    expect(await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG })).toEqual({ ok: true, id: "msg_1" });
    expect(out.sent[0].to).toBe(user.email);
    // Only a hash is kept, never the code, and not a plain sha256 of it (a 6-digit code would fall to a lookup table).
    const [row] = await db.select().from(emailConfirmations).where(eq(emailConfirmations.userId, user.id));
    expect(row.codeHash).not.toContain(out.code());
    for (const plain of [out.code(), `${user.id}:${out.code()}`, `email-confirm:${user.id}:${out.code()}`])
      expect(row.codeHash).not.toBe(createHash("sha256").update(plain).digest("hex"));

    const r = await confirmEmailCode(db, user.id, ` ${out.code().slice(0, 3)} ${out.code().slice(3)} `, ip);
    expect(r).toMatchObject({ ok: true, verified: true });
    const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
    expect(u.at).not.toBeNull();
    // Single use.
    expect(await confirmEmailCode(db, user.id, out.code(), ip)).toEqual({ ok: false, reason: "expired" });
    // Already confirmed: no new code.
    expect(await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG })).toEqual({ ok: false, reason: "already" });
  });

  it("the sweep removes expired codes and keeps live ones", async () => {
    const a = (await makeUser("A")).user;
    const b = (await makeUser("B")).user;
    const out = outbox();
    const ip = newIp();
    await sendConfirmCode(db, a.id, ip, { send: out.send, config: CFG, now: Date.now() - 2 * CONFIRM_CODE_TTL_MS });
    await sendConfirmCode(db, b.id, ip, { send: out.send, config: CFG });
    expect(await purgeExpiredConfirmCodes(db)).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(emailConfirmations).where(eq(emailConfirmations.userId, a.id))).toEqual([]);
    expect(await db.select().from(emailConfirmations).where(eq(emailConfirmations.userId, b.id))).toHaveLength(1);
  });

  it("says a send worked only when the provider returned an id, and leaves no code behind otherwise", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    expect(await sendConfirmCode(db, user.id, ip, { send: outbox("").send, config: CFG })).toEqual({ ok: false, reason: "failed" });
    const throwing = async () => {
      throw new Error("refused");
    };
    expect(await sendConfirmCode(db, user.id, ip, { send: throwing, config: CFG })).toEqual({ ok: false, reason: "failed" });
    expect(await db.select().from(emailConfirmations).where(eq(emailConfirmations.userId, user.id))).toEqual([]);
    expect(await sendConfirmCode(db, user.id, ip, { config: null })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("expires after 10 minutes", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    const out = outbox();
    const t0 = Date.now();
    await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG, now: t0 });
    expect(await confirmEmailCode(db, user.id, out.code(), ip, t0 + CONFIRM_CODE_TTL_MS + 1000)).toEqual({ ok: false, reason: "expired" });
    const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
    expect(u.at).toBeNull();
  });

  it("allows 5 tries, then the code is gone even if the right one is typed", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    const out = outbox();
    await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG, ...fixed() });
    for (let i = 0; i < 4; i++) expect(await confirmEmailCode(db, user.id, WRONG, ip)).toEqual({ ok: false, reason: "wrong" });
    expect(await confirmEmailCode(db, user.id, WRONG, ip)).toEqual({ ok: false, reason: "locked" });
    expect(await confirmEmailCode(db, user.id, RIGHT, ip)).toEqual({ ok: false, reason: "expired" });
  });

  it("a code for one person never works for another, and a new code replaces the old one", async () => {
    const a = (await makeUser("A")).user;
    const b = (await makeUser("B")).user;
    const ip = newIp();
    const out = outbox();
    await sendConfirmCode(db, a.id, ip, { send: out.send, config: CFG, ...fixed("111111") });
    await sendConfirmCode(db, b.id, ip, { send: out.send, config: CFG, ...fixed("222222") });
    // A's code typed for B is wrong, and B's own works only for B
    expect(await confirmEmailCode(db, b.id, "111111", ip)).toEqual({ ok: false, reason: "wrong" });
    await sendConfirmCode(db, a.id, ip, { send: out.send, config: CFG, ...fixed("333333") });
    expect(await confirmEmailCode(db, a.id, "111111", ip)).toEqual({ ok: false, reason: "wrong" });
    expect(await confirmEmailCode(db, a.id, "333333", ip)).toMatchObject({ ok: true });
    expect(await confirmEmailCode(db, b.id, "222222", ip)).toMatchObject({ ok: true });
  });

  it("limits sends to 3 an hour for a person, whatever network they're on", async () => {
    const { user } = await makeUser("Sam");
    const out = outbox();
    for (let i = 0; i < 3; i++) expect(await sendConfirmCode(db, user.id, newIp(), { send: out.send, config: CFG })).toMatchObject({ ok: true });
    expect(await sendConfirmCode(db, user.id, newIp(), { send: out.send, config: CFG })).toEqual({ ok: false, reason: "too_many" });
    expect(out.sent).toHaveLength(3);
  });

  it("a shared network can send many codes, but not without end: the per-network limits are a generous backstop", async () => {
    const ip = newIp();
    const out = outbox();
    // a campus: dozens of different students on one address, each sending a code, all get through
    for (let i = 0; i < 30; i++)
      expect(await sendConfirmCode(db, (await makeUser("S")).user.id, ip, { send: out.send, config: CFG })).toMatchObject({ ok: true });
    // at the limit, the next one from that network is refused
    await fillBucket(`email-confirm:send:ip:${ip}`, CONFIRM_SENDS_PER_IP_HOUR, 3600);
    expect(await sendConfirmCode(db, (await makeUser("S")).user.id, ip, { send: out.send, config: CFG })).toEqual({ ok: false, reason: "too_many" });
    // another network is unaffected
    expect(await sendConfirmCode(db, (await makeUser("S")).user.id, newIp(), { send: out.send, config: CFG })).toMatchObject({ ok: true });
  });

  it("code tries are limited per network too, with a limit far above a class of students", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    await sendConfirmCode(db, user.id, ip, { send: outbox().send, config: CFG, ...fixed() });
    await fillBucket(`email-confirm:try:ip:${ip}`, CONFIRM_TRIES_PER_IP_15MIN, 900);
    expect(await confirmEmailCode(db, user.id, RIGHT, ip)).toEqual({ ok: false, reason: "too_many" });
    // the same person from another network: the right code still works (their own limits are untouched)
    expect(await confirmEmailCode(db, user.id, RIGHT, newIp())).toMatchObject({ ok: true });
  });
});

describe("referral credit", () => {
  it("moves the inviter up one place only after the friend confirms", async () => {
    const { first, inviter, friend } = await inviterAndFriend();
    expect([await place(first.id), await place(inviter.id)]).toEqual([1, 2]);
    // Signed up with the link, not confirmed: nothing moves.
    expect(await place(inviter.id)).toBe(2);
    const r = await verifyEmail(db, friend.id);
    expect(r).toEqual({ verified: true, recorded: true, moved: true });
    expect([await place(inviter.id), await place(first.id)]).toEqual([1, 2]);
    const [ref] = await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id));
    expect(ref).toMatchObject({ inviteeId: friend.id, inviteeEmailHash: emailHash(friend.email) });
    expect(ref.creditedAt).not.toBeNull();
    // A repeat changes nothing.
    expect(await verifyEmail(db, friend.id)).toEqual({ verified: true, recorded: false, moved: false });
    expect(await place(inviter.id)).toBe(1);
  });

  it("credits once even when two confirmations arrive at the same moment", async () => {
    const { inviter, friend } = await inviterAndFriend();
    const results = await Promise.all([verifyEmail(db, friend.id), verifyEmail(db, friend.id), verifyEmail(db, friend.id)]);
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
    expect(await place(inviter.id)).toBe(1);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toHaveLength(1);
  });

  it("two friends of one inviter confirming their codes at the same moment don't deadlock, and each moves the inviter", async () => {
    await clearLine();
    await makeUser("A");
    await makeUser("B");
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    const ip = newIp();
    const pairs = [];
    for (const n of ["F1", "F2"]) {
      const f = (await makeUser(n)).user;
      await recordInvite(db, f.id, code);
      const out = outbox();
      await sendConfirmCode(db, f.id, ip, { send: out.send, config: CFG });
      pairs.push({ id: f.id, code: out.code() });
    }
    const results = await Promise.all(pairs.map((p) => confirmEmailCode(db, p.id, p.code, ip)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await place(inviter.id)).toBe(1);
  });

  it("two different friends confirming together each move the inviter one place", async () => {
    await clearLine();
    const a = (await makeUser("A")).user;
    const b = (await makeUser("B")).user;
    const inviter = (await makeUser("Inviter")).user;
    const f1 = (await makeUser("F1")).user;
    const f2 = (await makeUser("F2")).user;
    const code = await inviteCodeFor(db, inviter.id);
    await recordInvite(db, f1.id, code);
    await recordInvite(db, f2.id, code);
    expect(await place(inviter.id)).toBe(3);
    await Promise.all([verifyEmail(db, f1.id), verifyEmail(db, f2.id)]);
    expect(await place(inviter.id)).toBe(1);
    expect(await place(a.id)).toBe(2);
    expect(await place(b.id)).toBe(3);
  });

  it("a deleted account that signs up again with the same email never credits twice", async () => {
    const { inviter, friend } = await inviterAndFriend();
    await verifyEmail(db, friend.id);
    expect(await place(inviter.id)).toBe(1);
    await db.delete(users).where(eq(users.id, friend.id));
    // The referral stays (the invitee link is cleared), and the same email, normalized, is recognised.
    const [kept] = await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id));
    expect(kept.inviteeId).toBeNull();
    const [again] = await db
      .insert(users)
      .values({ name: "Friend again", email: friend.email, passwordHash: "x", invitedBy: inviter.id })
      .returning({ id: users.id });
    // the same email, in capitals and with spaces, is the same friend
    expect(emailHash(` ${friend.email.toUpperCase()} `)).toBe(emailHash(friend.email));
    expect(referralEmailKey(` ${friend.email.toUpperCase()} `)).toBe(referralEmailKey(friend.email));
    expect(await verifyEmail(db, again.id)).toEqual({ verified: true, recorded: false, moved: false });
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toHaveLength(1);
    // Moved up once only: first place was the other person, now the inviter.
    expect(await place(inviter.id)).toBe(1);
  });

  it("never credits a self-referral, the demo account, or a missing inviter", async () => {
    await clearLine();
    const first = (await makeUser("First")).user;
    const me = (await makeUser("Me")).user;
    // recordInvite refuses a self invite; a forced one still never credits.
    expect(await recordInvite(db, me.id, await inviteCodeFor(db, me.id))).toBe(false);
    await db.update(users).set({ invitedBy: me.id }).where(eq(users.id, me.id));
    expect(await verifyEmail(db, me.id)).toEqual({ verified: true, recorded: false, moved: false });
    expect(await place(me.id)).toBe(2);

    // Demo friend.
    const inviter = (await makeUser("Inviter")).user;
    const demo = (await makeUser("Demo")).user;
    await db.update(users).set({ accountKind: "demo", invitedBy: inviter.id }).where(eq(users.id, demo.id));
    expect((await verifyEmail(db, demo.id)).recorded).toBe(false);
    // Demo inviter.
    const demoInviter = (await makeUser("DemoInviter")).user;
    await db.update(users).set({ accountKind: "demo" }).where(eq(users.id, demoInviter.id));
    const friend = (await makeUser("Friend")).user;
    await db.update(users).set({ invitedBy: demoInviter.id }).where(eq(users.id, friend.id));
    expect((await verifyEmail(db, friend.id)).recorded).toBe(false);
    // Inviter deleted: invited_by is cleared, so there is nobody to credit.
    const gone = (await makeUser("Gone")).user;
    const late = (await makeUser("Late")).user;
    await recordInvite(db, late.id, await inviteCodeFor(db, gone.id));
    await db.delete(users).where(eq(users.id, gone.id));
    expect((await verifyEmail(db, late.id)).recorded).toBe(false);
    expect(await db.select().from(waitlistReferrals)).not.toContainEqual(expect.objectContaining({ inviteeId: me.id }));
    expect(await place(first.id)).toBe(1);
  });

  it("an inviter who is already in still has the friend recorded, and nobody moves; first place stays first", async () => {
    const { first, inviter, friend } = await inviterAndFriend();
    await acceptUsers(db, [inviter.id]);
    const before = [await place(first.id), await place(friend.id)];
    expect(await verifyEmail(db, friend.id)).toEqual({ verified: true, recorded: true, moved: false });
    expect([await place(first.id), await place(friend.id)]).toEqual(before);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toHaveLength(1);

    // First in line inviting someone: recorded, still first, nobody else changes.
    const friend2 = (await makeUser("Friend2")).user;
    await recordInvite(db, friend2.id, await inviteCodeFor(db, first.id));
    const f2Place = await place(friend2.id);
    expect(await verifyEmail(db, friend2.id)).toEqual({ verified: true, recorded: true, moved: false });
    expect(await place(first.id)).toBe(1);
    expect(await place(friend2.id)).toBe(f2Place);
  });

  it("the credit lives in the caller's transaction: if that transaction is rolled back, no friend is recorded and nobody moves", async () => {
    const { inviter, friend } = await inviterAndFriend();
    await expect(
      db.transaction(async (tx) => {
        await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, friend.id));
        expect((await creditReferral(tx, friend.id)).recorded).toBe(true);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toEqual([]);
    expect(await place(inviter.id)).toBe(2);
  });

  it("confirming by code credits the inviter in the same step", async () => {
    const { inviter, friend } = await inviterAndFriend();
    const ip = newIp();
    const out = outbox();
    await sendConfirmCode(db, friend.id, ip, { send: out.send, config: CFG });
    expect(await confirmEmailCode(db, friend.id, out.code(), ip)).toEqual({ ok: true, verified: true, recorded: true, moved: true });
    expect(await place(inviter.id)).toBe(1);
  });
});

describe("alias farming, the keyed hash and the daily cap", () => {
  it("reads plus and dot aliases of one Gmail inbox as one address, and leaves other domains' dots alone", () => {
    const key = referralEmailKey("Sam.Lee+promo@Gmail.com");
    expect(key).toBe("samlee@gmail.com");
    expect(referralEmailKey("s.a.m.l.e.e@googlemail.com")).toBe(key);
    expect(referralEmailKey("samlee+a+b@gmail.com")).toBe(key);
    expect(referralEmailKey("sam.lee+x@school.edu")).toBe("sam.lee@school.edu");
    expect(referralEmailKey("sam.lee@school.edu")).not.toBe(referralEmailKey("samlee@school.edu"));
    expect(emailHash("a.b+c@gmail.com")).toBe(emailHash("ab@googlemail.com"));
  });

  it("the stored hash is an HMAC under a key derived from ENCRYPTION_KEY: a known vector, and another key gives another hash", () => {
    const plain = createHash("sha256").update("ab@gmail.com").digest("hex");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    try {
      // computed once with HKDF-SHA256 (label "lifeflow:waitlist-referral-email") and HMAC-SHA256 over the alias key
      expect(emailHash("ab@gmail.com")).toBe("ac3fef84dbd490b9859be2d33f6d35498403d0a42682376071201cdf2bf0ba23");
      expect(emailHash("ab@gmail.com")).not.toBe(plain);
      vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
      expect(emailHash("ab@gmail.com")).not.toBe("ac3fef84dbd490b9859be2d33f6d35498403d0a42682376071201cdf2bf0ba23");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("aliases of one Gmail inbox credit the inviter once", async () => {
    await clearLine();
    await makeUser("First");
    const inviter = (await makeUser("Inviter")).user;
    const box = `box${randomUUID().slice(0, 8)}`;
    const emails = [`${box}@gmail.com`, `${box.slice(0, 4)}.${box.slice(4)}+promo@gmail.com`, `${box}@googlemail.com`];
    const friends: string[] = [];
    for (const email of emails) {
      const [f] = await db.insert(users).values({ name: "Alias", email, passwordHash: "x", invitedBy: inviter.id }).returning({ id: users.id });
      made.push(f.id);
      friends.push(f.id);
    }
    const results = [];
    for (const id of friends) results.push(await verifyEmail(db, id));
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
    expect(await place(inviter.id)).toBe(1);
  });

  it("caps moves at 10 a day: the 11th friend is recorded without a move and not counted", async () => {
    await clearLine();
    for (let i = 0; i < 11; i++) await makeUser(`Filler${i}`);
    const inviter = (await makeUser("Inviter")).user;
    expect(await place(inviter.id)).toBe(12);
    const code = await inviteCodeFor(db, inviter.id);
    const friends = [];
    for (let i = 0; i < MAX_CREDITS_PER_DAY + 1; i++) {
      const f = (await makeUser(`F${i}`)).user;
      await recordInvite(db, f.id, code);
      friends.push(f.id);
    }
    for (const id of friends.slice(0, MAX_CREDITS_PER_DAY)) expect(await verifyEmail(db, id)).toMatchObject({ recorded: true, moved: true });
    expect(await place(inviter.id)).toBe(2);
    expect(await verifyEmail(db, friends[MAX_CREDITS_PER_DAY])).toEqual({ verified: true, recorded: true, moved: false });
    expect(await place(inviter.id)).toBe(2);
    const rows = await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id));
    expect(rows).toHaveLength(11);
    expect(rows.filter((r) => r.creditedAt)).toHaveLength(10);
    expect((await waitlistPage(db, inviter.id)).friends).toBe(10);
  });

  it("the daily cap counts moves, not credited friends: ten friends who moved nobody don't use it up", async () => {
    await clearLine();
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    expect(await place(inviter.id)).toBe(1);
    const friends: string[] = [];
    for (let i = 0; i < MAX_CREDITS_PER_DAY + 1; i++) {
      const f = (await makeUser(`F${i}`)).user;
      await recordInvite(db, f.id, code);
      friends.push(f.id);
    }
    // first place stays first: ten friends are recorded and counted, none moves anyone
    for (const id of friends.slice(0, MAX_CREDITS_PER_DAY)) expect(await verifyEmail(db, id)).toEqual({ verified: true, recorded: true, moved: false });
    // someone later takes the place ahead (the owner lets the queue change); the 11th friend still gets a real move
    const [{ rank }] = await db.select({ rank: users.waitlistRank }).from(users).where(eq(users.id, inviter.id));
    const filler = (await makeUser("Filler")).user;
    await db
      .update(users)
      .set({ waitlistRank: rank - 1_000_000 - Math.floor(Math.random() * 1000) })
      .where(eq(users.id, filler.id));
    expect(await place(inviter.id)).toBe(2);
    expect(await verifyEmail(db, friends[MAX_CREDITS_PER_DAY])).toEqual({ verified: true, recorded: true, moved: true });
    expect(await place(inviter.id)).toBe(1);
    const rows = await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id));
    expect(rows.filter((r) => r.movedAt)).toHaveLength(1);
    expect(rows.filter((r) => r.creditedAt)).toHaveLength(11);
  });

  it("a person gets 10 tries a day in total: a new code doesn't reset the count", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    const out = outbox();
    const wrongFor = () => WRONG;
    let tries = 0;
    for (const n of [4, 4, 2]) {
      await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG, ...fixed() });
      for (let i = 0; i < n; i++, tries++) expect(await confirmEmailCode(db, user.id, wrongFor(), ip)).toEqual({ ok: false, reason: "wrong" });
    }
    expect(tries).toBe(10);
    // the eleventh try is refused, even with the right code from the newest email
    expect(await confirmEmailCode(db, user.id, out.code(), ip)).toEqual({ ok: false, reason: "too_many" });
    const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
    expect(u.at).toBeNull();
  });

  it("the daily cap looks only at the last 24 hours: moves older than that don't count", async () => {
    await clearLine();
    for (let i = 0; i < 3; i++) await makeUser(`Filler${i}`);
    const inviter = (await makeUser("Inviter")).user;
    const old = new Date(Date.now() - 25 * 3600_000);
    for (let i = 0; i < MAX_CREDITS_PER_DAY; i++)
      await db.insert(waitlistReferrals).values({ inviterId: inviter.id, inviteeEmailHash: `old-${randomUUID()}`, creditedAt: old, movedAt: old });
    const f = (await makeUser("F")).user;
    await recordInvite(db, f.id, await inviteCodeFor(db, inviter.id));
    expect(await verifyEmail(db, f.id)).toEqual({ verified: true, recorded: true, moved: true });
    expect(await place(inviter.id)).toBe(3);
  });

  it("the daily cap holds when many friends confirm at once: exactly 10 moves, the rest recorded without one", async () => {
    await clearLine();
    for (let i = 0; i < 14; i++) await makeUser(`Filler${i}`);
    const inviter = (await makeUser("Inviter")).user;
    expect(await place(inviter.id)).toBe(15);
    const code = await inviteCodeFor(db, inviter.id);
    const friends: string[] = [];
    for (let i = 0; i < 13; i++) {
      const f = (await makeUser(`F${i}`)).user;
      await recordInvite(db, f.id, code);
      friends.push(f.id);
    }
    const results = await Promise.all(friends.map((id) => verifyEmail(db, id)));
    expect(results.filter((r) => r.moved)).toHaveLength(MAX_CREDITS_PER_DAY);
    expect(results.filter((r) => r.recorded)).toHaveLength(13);
    expect(await place(inviter.id)).toBe(5);
    const rows = await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id));
    expect(rows.filter((r) => r.movedAt)).toHaveLength(MAX_CREDITS_PER_DAY);
  });

  it("parallel wrong guesses never exceed 5 tries", async () => {
    const { user } = await makeUser("Sam");
    const ip = newIp();
    const out = outbox();
    await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG, ...fixed() });
    const wrong = WRONG;
    const results = await Promise.all(Array.from({ length: 12 }, () => confirmEmailCode(db, user.id, wrong, ip)));
    expect(results.filter((r) => !r.ok && r.reason === "wrong").length).toBeLessThanOrEqual(4);
    expect(results.filter((r) => !r.ok && r.reason === "locked").length).toBeGreaterThanOrEqual(1);
    // The code is gone (and the day's tries are used): even the right one fails now.
    expect(await confirmEmailCode(db, user.id, out.code(), ip)).toMatchObject({ ok: false });
  });
});

describe("Google and Apple sign-up", () => {
  const signin = (invite?: string | null) => ({ mode: "signin" as const, tz: "UTC", userId: null, invite });

  it("a provider's verified email doesn't count on its own: no referral and no move until the friend confirms the code", async () => {
    await clearLine();
    await makeUser("First");
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    const g = { sub: `g-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@gmail.com`, emailVerified: true, isPrivateEmail: false };
    const out = await completeGoogleSignIn(db, g, signin(code.toUpperCase()), "Ana");
    expect(out.kind).toBe("created");
    const [u] = await db.select().from(users).where(eq(users.email, g.email));
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.invitedBy).toBe(inviter.id);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toEqual([]);
    expect(await place(inviter.id)).toBe(2);

    const a = { sub: `a-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@privaterelay.example`, emailVerified: true, isPrivateEmail: true };
    await completeAppleSignIn(db, a, signin(code), "Ben");
    const [v] = await db.select().from(users).where(eq(users.email, a.email));
    expect(v).toMatchObject({ invitedBy: inviter.id, emailVerifiedAt: null });
    expect(await place(inviter.id)).toBe(2);

    // The friend confirms the code like everyone else, and only then does the inviter move.
    const ip = newIp();
    const out2 = outbox();
    await sendConfirmCode(db, u.id, ip, { send: out2.send, config: CFG });
    expect(await confirmEmailCode(db, u.id, out2.code(), ip)).toMatchObject({ ok: true, recorded: true, moved: true });
    expect(await place(inviter.id)).toBe(1);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toHaveLength(1);
  });

  it("a provider sign-up without an invite, or with a bad one, is unconfirmed and credits nobody", async () => {
    const before = (await db.select().from(waitlistReferrals)).length;
    const g = { sub: `g-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@gmail.com`, emailVerified: true, isPrivateEmail: false };
    await completeGoogleSignIn(db, g, signin("nosuchcode1"), null);
    const [u] = await db.select().from(users).where(eq(users.email, g.email));
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.invitedBy).toBeNull();
    expect((await db.select().from(waitlistReferrals)).length).toBe(before);
    // An unverified provider email never creates an account.
    await expect(completeGoogleSignIn(db, { ...g, sub: "x", email: "no@x.com", emailVerified: false }, signin(), null)).rejects.toThrow(/verified/);
  });

  it("Apple's start stores the invite in the single-use state too, in sign-in mode only", async () => {
    const cfg = { clientId: "c", teamId: "t", keyId: "k", privateKey: "p", redirectUri: "https://app.example/api/auth/apple/callback" };
    const r = await startAppleSignIn(db, cfg, { mode: "signin", invite: " AbCdEfGh23 " });
    expect((await parseAppleState((await takeChallenge(db, "apple", r.token))!.challenge)).invite).toBe("abcdefgh23");
    const bad = await startAppleSignIn(db, cfg, { mode: "signin", invite: "<script>" });
    expect((await parseAppleState((await takeChallenge(db, "apple", bad.token))!.challenge)).invite).toBeNull();
    const link = await startAppleSignIn(db, cfg, { mode: "link", invite: "abcdefgh23", userId: (await makeUser("L")).user.id });
    expect((await parseAppleState((await takeChallenge(db, "apple", link.token))!.challenge)).invite).toBeNull();
  });

  it("the invite code survives the round trip in the single-use state, in sign-in mode only", async () => {
    const cfg = { clientId: "c", clientSecret: "s", redirectUri: "https://app.example/api/auth/google/callback" };
    const r = await startGoogleSignIn(db, cfg, { mode: "signin", invite: " AbCdEfGh23 " });
    const state = parseGoogleState((await takeChallenge(db, "google", r.token))!.challenge);
    expect(state.invite).toBe("abcdefgh23");
    expect(await takeChallenge(db, "google", r.token)).toBeNull();
    const bad = await startGoogleSignIn(db, cfg, { mode: "signin", invite: "<script>" });
    expect(parseGoogleState((await takeChallenge(db, "google", bad.token))!.challenge).invite).toBeNull();
    const link = await startGoogleSignIn(db, cfg, { mode: "link", invite: "abcdefgh23", userId: (await makeUser("L")).user.id });
    expect(parseGoogleState((await takeChallenge(db, "google", link.token))!.challenge).invite).toBeNull();
    expect(validInviteCode("abc")).toBeNull();
  });
});

describe("deleting an account follows the queue-lock order", () => {
  it("waits for a move in progress instead of landing inside it", async () => {
    await clearLine();
    const person = (await makeUser("Leaving")).user;
    // no password to check (a Google sign-up), so the only thing that can make the deletion wait is the queue lock
    await db.update(users).set({ passwordHash: "!google" }).where(eq(users.id, person.id));
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const gotLock = new Promise<void>((r) => (locked = r));
    const mover = db.transaction(async (tx) => {
      await lockQueue(tx);
      locked();
      await held;
    });
    await gotLock;
    let done = false;
    const deleting = deleteAccount(db, person.id, "").then(() => (done = true));
    await new Promise((r) => setTimeout(r, 400));
    expect(done).toBe(false);
    release();
    await mover;
    await deleting;
    expect(await db.select().from(users).where(eq(users.id, person.id))).toEqual([]);
  });
});

describe("the friend's dedupe row outlives the inviter", () => {
  it("deleting the inviter keeps the friend's hash with no inviter, and that email can't be credited again through someone else", async () => {
    const { inviter, friend } = await inviterAndFriend();
    await verifyEmail(db, friend.id);
    await db.delete(users).where(eq(users.id, inviter.id));
    const [row] = await db
      .select()
      .from(waitlistReferrals)
      .where(eq(waitlistReferrals.inviteeEmailHash, emailHash(friend.email)));
    expect(row).toMatchObject({ inviterId: null, inviteeId: friend.id });
    // the friend deletes their account too and signs up again through another person's link
    await db.delete(users).where(eq(users.id, friend.id));
    const other = (await makeUser("Other")).user;
    const filler = (await makeUser("Filler")).user;
    const [again] = await db.insert(users).values({ name: "Friend", email: friend.email, passwordHash: "x", invitedBy: other.id }).returning({ id: users.id });
    made.push(again.id);
    const before = await place(other.id);
    expect(await verifyEmail(db, again.id)).toEqual({ verified: true, recorded: false, moved: false });
    expect(await place(other.id)).toBe(before);
    expect(await place(filler.id)).toBeGreaterThan(before!);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, other.id))).toEqual([]);
    expect((await waitlistPage(db, other.id)).friends).toBe(0);
  });
});

describe("an under-13 lock takes the account out of the queue", () => {
  it("a locked waiting child is out of the counts, the front, the moves, the acceptance and the invite code", async () => {
    await clearLine();
    const a = (await makeUser("A")).user;
    const kid = await makeUser("Kai Young");
    const b = (await makeUser("B")).user;
    await db
      .update(users)
      .set({ preferences: { onboarding: "pending" }, invitedBy: a.id })
      .where(eq(users.id, kid.user.id));
    const code = await inviteCodeFor(db, kid.user.id);
    expect(await waitingCount(db)).toBe(3);
    expect(await place(b.id)).toBe(3);
    expect(await kid.run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 9}-03-03` }))).toEqual({ blocked: true });

    expect(await waitingCount(db)).toBe(2);
    expect((await nextInLine(db, 10)).map((p) => p.id)).toEqual([a.id, b.id]);
    expect((await waitlistPage(db, a.id)).front.map((f) => f.place)).toEqual([1, 2]);
    expect(await place(kid.user.id)).toBeNull();
    expect(await place(b.id)).toBe(2);
    // b moves past a, not past the locked child
    expect(await moveUpOne(db, b.id)).toBe(true);
    expect([await place(b.id), await place(a.id)]).toEqual([1, 2]);
    expect(await moveUpOne(db, kid.user.id)).toBe(false);
    expect(await acceptUsers(db, [kid.user.id])).toEqual({ accepted: [], already: [kid.user.id] });
    // the invite code and the inviter link are cleared, so the public invite page no longer resolves
    expect(await inviterFor(db, code)).toBeNull();
    const [row] = await db.select({ code: users.inviteCode, by: users.invitedBy, access: users.access }).from(users).where(eq(users.id, kid.user.id));
    expect(row).toEqual({ code: null, by: null, access: "waiting" });
  });

  it("a friend of a locked inviter is never credited to them", async () => {
    await clearLine();
    const kid = await makeUser("Kai Young");
    const friend = (await makeUser("Friend")).user;
    await db
      .update(users)
      .set({ preferences: { onboarding: "pending" } })
      .where(eq(users.id, kid.user.id));
    await recordInvite(db, friend.id, await inviteCodeFor(db, kid.user.id));
    await kid.run((s) => saveWelcomeProgress(s, "UTC", { birthDate: `${new Date().getFullYear() - 9}-03-03` }));
    expect((await verifyEmail(db, friend.id)).recorded).toBe(false);
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, kid.user.id))).toEqual([]);
  });
});

describe("the page's counts", () => {
  it("shows friends counted and friends waiting to confirm, from real rows", async () => {
    await clearLine();
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    const f1 = (await makeUser("F1")).user;
    const f2 = (await makeUser("F2")).user;
    await recordInvite(db, f1.id, code);
    await recordInvite(db, f2.id, code);
    expect(await waitlistPage(db, inviter.id)).toMatchObject({ friends: 0, pending: 2, emailVerified: false, invited: false });
    await verifyEmail(db, f1.id);
    expect(await waitlistPage(db, inviter.id)).toMatchObject({ friends: 1, pending: 1 });
    expect(await waitlistPage(db, f1.id)).toMatchObject({ emailVerified: true, invited: true, friends: 0, pending: 0 });
    expect(await waitlistPage(db, f2.id)).toMatchObject({ emailVerified: false, invited: true });
  });
});
