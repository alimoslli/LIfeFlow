import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { completeAppleSignIn } from "@/server/auth/apple";
import { takeChallenge } from "@/server/auth/challenges";
import { completeGoogleSignIn, parseGoogleState, startGoogleSignIn } from "@/server/auth/google-signin";
import { closeDb, getDb } from "@/server/db/client";
import { emailConfirmations, users, waitlistReferrals } from "@/server/db/schema";
import { confirmEmailCode, CONFIRM_CODE_TTL_MS, sendConfirmCode } from "@/server/services/email-confirm";
import { inviteCodeFor, recordInvite, validInviteCode } from "@/server/services/invites";
import { creditReferral, emailHash, normalizeEmail, verifyEmail } from "@/server/services/referrals";
import { acceptUsers, waitlistPage, waitlistPlace } from "@/server/services/waitlist";
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
const CFG = { apiKey: "test", from: "LifeFlow <test@example.com>" };
const place = (id: string) => waitlistPlace(db, id);
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
    // Only a hash is kept, never the code.
    const [row] = await db.select().from(emailConfirmations).where(eq(emailConfirmations.userId, user.id));
    expect(row.codeHash).not.toContain(out.code());

    const r = await confirmEmailCode(db, user.id, ` ${out.code().slice(0, 3)} ${out.code().slice(3)} `, ip);
    expect(r).toMatchObject({ ok: true, verified: true });
    const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
    expect(u.at).not.toBeNull();
    // Single use.
    expect(await confirmEmailCode(db, user.id, out.code(), ip)).toEqual({ ok: false, reason: "expired" });
    // Already confirmed: no new code.
    expect(await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG })).toEqual({ ok: false, reason: "already" });
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
    await sendConfirmCode(db, user.id, ip, { send: out.send, config: CFG });
    const wrong = out.code() === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(await confirmEmailCode(db, user.id, wrong, ip)).toEqual({ ok: false, reason: "wrong" });
    expect(await confirmEmailCode(db, user.id, wrong, ip)).toEqual({ ok: false, reason: "locked" });
    expect(await confirmEmailCode(db, user.id, out.code(), ip)).toEqual({ ok: false, reason: "expired" });
  });

  it("a code for one person never works for another, and a new code replaces the old one", async () => {
    const a = (await makeUser("A")).user;
    const b = (await makeUser("B")).user;
    const ip = newIp();
    const out = outbox();
    await sendConfirmCode(db, a.id, ip, { send: out.send, config: CFG });
    const aCode = out.code();
    await sendConfirmCode(db, b.id, ip, { send: out.send, config: CFG });
    expect(await confirmEmailCode(db, b.id, aCode === out.code() ? "999999" : aCode, ip)).toMatchObject({ ok: false });
    await sendConfirmCode(db, a.id, ip, { send: out.send, config: CFG });
    const newest = out.code();
    if (newest !== aCode) expect(await confirmEmailCode(db, a.id, aCode, ip)).toEqual({ ok: false, reason: "wrong" });
    expect(await confirmEmailCode(db, a.id, newest, ip)).toMatchObject({ ok: true });
  });

  it("limits sends to 3 an hour for a person, and per network", async () => {
    const { user } = await makeUser("Sam");
    const out = outbox();
    for (let i = 0; i < 3; i++) expect(await sendConfirmCode(db, user.id, newIp(), { send: out.send, config: CFG })).toMatchObject({ ok: true });
    expect(await sendConfirmCode(db, user.id, newIp(), { send: out.send, config: CFG })).toEqual({ ok: false, reason: "too_many" });
    expect(out.sent).toHaveLength(3);
    const ip = newIp();
    const results = [];
    for (let i = 0; i < 11; i++) results.push((await sendConfirmCode(db, (await makeUser("N")).user.id, ip, { send: out.send, config: CFG })).ok);
    expect(results.filter(Boolean)).toHaveLength(10);
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
    expect(normalizeEmail(` ${friend.email.toUpperCase()} `)).toBe(friend.email);
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

  it("is atomic: if the move fails, the friend is not recorded", async () => {
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

describe("Google and Apple sign-up", () => {
  const signin = (invite?: string | null) => ({ mode: "signin" as const, tz: "UTC", userId: null, invite });

  it("an account made with a verified provider email counts as verified and credits the inviter", async () => {
    await clearLine();
    await makeUser("First");
    const inviter = (await makeUser("Inviter")).user;
    const code = await inviteCodeFor(db, inviter.id);
    const g = { sub: `g-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@gmail.com`, emailVerified: true, isPrivateEmail: false };
    const out = await completeGoogleSignIn(db, g, signin(code.toUpperCase()), "Ana");
    expect(out.kind).toBe("created");
    const [u] = await db.select().from(users).where(eq(users.email, g.email));
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.invitedBy).toBe(inviter.id);
    expect(await place(inviter.id)).toBe(1);

    const a = { sub: `a-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@privaterelay.example`, emailVerified: true, isPrivateEmail: true };
    await completeAppleSignIn(db, a, signin(code), "Ben");
    const [v] = await db.select().from(users).where(eq(users.email, a.email));
    expect(v).toMatchObject({ invitedBy: inviter.id });
    expect(v.emailVerifiedAt).not.toBeNull();
    expect(await db.select().from(waitlistReferrals).where(eq(waitlistReferrals.inviterId, inviter.id))).toHaveLength(2);
  });

  it("a provider sign-up without an invite, or with a bad one, is verified and credits nobody", async () => {
    const before = (await db.select().from(waitlistReferrals)).length;
    const g = { sub: `g-${randomUUID()}`, email: `${randomUUID().slice(0, 8)}@gmail.com`, emailVerified: true, isPrivateEmail: false };
    await completeGoogleSignIn(db, g, signin("nosuchcode1"), null);
    const [u] = await db.select().from(users).where(eq(users.email, g.email));
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.invitedBy).toBeNull();
    expect((await db.select().from(waitlistReferrals)).length).toBe(before);
    // An unverified provider email never creates an account.
    await expect(completeGoogleSignIn(db, { ...g, sub: "x", email: "no@x.com", emailVerified: false }, signin(), null)).rejects.toThrow(/verified/);
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
