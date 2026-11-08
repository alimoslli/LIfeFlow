import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { phoneCodes, users } from "@/server/db/schema";
import { confirmAddLoginPhone, finishPhoneSignIn, removeLoginPhone, startAddLoginPhone, startPhoneSignIn, type Channels } from "@/server/auth/phone-login";
import { makeUser } from "../helpers";

afterAll(closeDb);
const db = getDb();

/** A fake Resend / Twilio that remembers what it was asked to send. */
function fakeChannels(kind: "email" | "sms" = "email") {
  const sent: { to: string; body: string }[] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    if (String(url).includes("resend")) {
      const j = JSON.parse(init.body);
      sent.push({ to: j.to[0], body: j.text });
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }
    const p = new URLSearchParams(init.body);
    sent.push({ to: p.get("To")!, body: p.get("Body")! });
    return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
  }) as unknown as typeof fetch;
  const c: Channels =
    kind === "email"
      ? { sms: null, email: { apiKey: "k", from: "LifeFlow <a@b.co>" }, fetchImpl }
      : { sms: { accountSid: "AC1", authToken: "t", from: "+15550001111", appUrl: "https://lifeflowweb.com" }, email: null, fetchImpl };
  return { c, sent, last: () => /\b(\d{6})\b/.exec(sent.at(-1)!.body)![1] };
}
const phoneN = () => `+1555${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;

describe("sign in with a phone number", () => {
  it("add a number (code by email until texting is set up), then sign in with it", async () => {
    const { user } = await makeUser();
    const phone = phoneN();
    const f = fakeChannels("email");
    const r = await startAddLoginPhone(db, user.id, phone, f.c);
    expect(r.via).toBe("email");
    expect(f.sent[0].to).toBe(user.email);
    expect(f.sent[0].body).not.toContain("undefined");
    await expect(confirmAddLoginPhone(db, user.id, phone, "000000")).rejects.toThrow(/doesn't match/);
    await confirmAddLoginPhone(db, user.id, phone, f.last());
    const [row] = await db.select({ p: users.loginPhone, via: users.loginPhoneVia, sms: users.smsPhone }).from(users).where(eq(users.id, user.id));
    expect(row).toEqual({ p: phone, via: "email", sms: null }); // never the texting number

    await startPhoneSignIn(db, phone, f.c);
    expect(f.sent).toHaveLength(2);
    expect(await finishPhoneSignIn(db, phone, "123456")).toEqual({ ok: false, reason: "wrong" });
    expect(await finishPhoneSignIn(db, phone, f.last())).toEqual({ ok: true, userId: user.id });
    // A code works once.
    expect(await finishPhoneSignIn(db, phone, f.last())).toMatchObject({ ok: false });
  });

  it("never reveals whether a number has an account", async () => {
    const f = fakeChannels("email");
    const unknown = phoneN();
    expect(await startPhoneSignIn(db, unknown, f.c)).toBe("email");
    expect(f.sent).toHaveLength(0);
    expect(await finishPhoneSignIn(db, unknown, "123456")).toEqual({ ok: false, reason: "wrong" });
    await expect(startPhoneSignIn(db, "12", f.c)).rejects.toThrow(/mobile number/);
  });

  it("locks after 5 wrong tries, expires, and sends at most 3 codes an hour", async () => {
    const { user } = await makeUser();
    const phone = phoneN();
    await db.update(users).set({ loginPhone: phone, loginPhoneVia: "email" }).where(eq(users.id, user.id));
    const f = fakeChannels("email");
    const now = new Date();
    await startPhoneSignIn(db, phone, f.c, now);
    const good = f.last();
    for (let i = 0; i < 5; i++) await finishPhoneSignIn(db, phone, "999999", now);
    expect(await finishPhoneSignIn(db, phone, good, now)).toEqual({ ok: false, reason: "wrong" }); // locked, even with the right code

    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await finishPhoneSignIn(db, phone, good, later)).toMatchObject({ ok: false }); // expired
    for (let i = 0; i < 4; i++) await startPhoneSignIn(db, phone, f.c, now);
    expect(f.sent.length).toBe(3);
  });

  it("a suspended account and an email code after a password reset get nothing", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const pa = phoneN();
    const pb = phoneN();
    await db.update(users).set({ loginPhone: pa, suspendedAt: new Date() }).where(eq(users.id, a.user.id));
    await db.update(users).set({ loginPhone: pb, emailCodesBlockedAt: new Date() }).where(eq(users.id, b.user.id));
    const f = fakeChannels("email");
    await startPhoneSignIn(db, pa, f.c);
    await startPhoneSignIn(db, pb, f.c);
    expect(f.sent).toHaveLength(0);
    // By text the reset doesn't matter: the code goes to the phone itself.
    const t = fakeChannels("sms");
    await startPhoneSignIn(db, pb, t.c);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe(pb);
    expect(t.sent[0].body).toMatch(new RegExp(`@lifeflowweb.com #${t.last()}`)); // lets Android fill it in
  });

  it("a number belongs to one account; a failed send leaves no code behind; removing it stops sign-in", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const phone = phoneN();
    const f = fakeChannels("email");
    await startAddLoginPhone(db, a.user.id, phone, f.c);
    await confirmAddLoginPhone(db, a.user.id, phone, f.last());
    await expect(startAddLoginPhone(db, b.user.id, phone, f.c)).rejects.toThrow(/another account/);

    const broken: Channels = {
      sms: null,
      email: { apiKey: "k", from: "x" },
      fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    };
    await expect(startAddLoginPhone(db, b.user.id, phoneN(), broken)).rejects.toThrow(/couldn't be sent/);
    expect((await db.select().from(phoneCodes).where(eq(phoneCodes.userId, b.user.id))).length).toBe(0);
    await expect(startAddLoginPhone(db, b.user.id, phoneN(), { sms: null, email: null })).rejects.toThrow(/aren't available/);

    await removeLoginPhone(db, a.user.id);
    await startPhoneSignIn(db, phone, f.c);
    expect(f.sent).toHaveLength(1); // only the add code
  });
});
