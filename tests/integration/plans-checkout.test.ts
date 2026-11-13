import { createHmac } from "node:crypto";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { applyStripeEvent } from "@/server/billing";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { plansConfig, startPlanCheckout, type PlanKey } from "@/server/plans";
import { confirmStudentCode, sendConfirmCode, sendStudentCode, studentVerificationState } from "@/server/services/email-confirm";
import { rateLimitBuckets, studentVerifications } from "@/server/db/schema";
import { makeUser } from "../helpers";

afterAll(closeDb);

const ENV = {
  PLANS_PAYWALL: "on",
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec",
  APP_URL: "https://lifeflow.test",
  STRIPE_PRICE_STUDENT_OWN: "price_so",
  STRIPE_PRICE_STUDENT_OPENAI: "price_sa",
  STRIPE_PRICE_STANDARD_OWN: "price_no",
  STRIPE_PRICE_STANDARD_OPENAI: "price_na",
};
const CFG = plansConfig(ENV)!;

/** A fake Stripe client that records the checkout form and never leaves the machine. */
function fakeStripe() {
  const calls: URLSearchParams[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(new URLSearchParams(String(init?.body)));
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/c/1" }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** Frees the one-open-checkout slot so a test can start the person's next checkout. */
const freeSlot = (u: { id: string }) =>
  getDb()
    .delete(rateLimitBuckets)
    .where(like(rateLimitBuckets.key, `plan-checkout:${u.id}`));

const as = async (lifeStage: "student" | "working") => {
  const { user } = await makeUser();
  return { id: user.id, email: user.email, preferences: { lifeStage } as never };
};

describe("plan checkout", () => {
  it("sends each buyable test price for its audience, with the signed-in account as the reference", async () => {
    const cases: ["student" | "working", PlanKey, string][] = [
      ["student", "student_openai", "price_sa"],
      ["working", "standard_openai", "price_na"],
    ];
    for (const [stage, key, price] of cases) {
      const u = await as(stage);
      const stripe = fakeStripe();
      if (stage === "student")
        await getDb().insert(studentVerifications).values({ userId: u.id, email: "s@school.edu", codeHash: "", expiresAt: new Date(), verifiedAt: new Date() });
      const url = await startPlanCheckout(getDb(), u, key, { cfg: CFG, fetchImpl: stripe.fetchImpl });
      expect(url).toBe("https://checkout.stripe.test/c/1");
      expect(stripe.calls[0].get("line_items[0][price]")).toBe(price);
      expect(stripe.calls[0].get("client_reference_id")).toBe(u.id);
    }
  });

  it("refuses the hidden own-model plans, the other audience's plans and unknown plans without calling Stripe", async () => {
    const stripe = fakeStripe();
    const student = await as("student");
    for (const key of ["student_own", "standard_own", "standard_openai", "bogus", ""]) {
      await expect(startPlanCheckout(getDb(), student, key, { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 400 });
    }
    expect(stripe.calls).toHaveLength(0);
  });

  it("answers 404 and never calls Stripe while the switch is off or the key is live", async () => {
    const stripe = fakeStripe();
    const u = await as("student");
    await expect(
      startPlanCheckout(getDb(), u, "student_openai", { cfg: plansConfig({ ...ENV, PLANS_PAYWALL: "off" }), fetchImpl: stripe.fetchImpl }),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      startPlanCheckout(getDb(), u, "student_openai", { cfg: plansConfig({ ...ENV, STRIPE_SECRET_KEY: "sk_live_x" }), fetchImpl: stripe.fetchImpl }),
    ).rejects.toMatchObject({ status: 404 });
    expect(stripe.calls).toHaveLength(0);
  });
});

let kidCount = 0;
// every send uses a fresh address: the per-address limit is a day long and the test database keeps its counters between runs
const uniqueKid = () => `kid${Date.now()}${Math.floor(Math.random() * 1e6)}x${kidCount++}@school.edu`;

describe("the student price needs a confirmed student email", () => {
  const MAIL = { config: { apiKey: "k", from: "a@b.test" } as never };
  const sender = () => {
    const sent: { to: string }[] = [];
    return { sent, send: (async (_c: unknown, m: { to: string }) => (sent.push({ to: m.to }), { id: "em_1" })) as never };
  };
  const verified = async (u: { id: string }, now = Date.now()) => {
    const s = sender();
    const address = uniqueKid();
    expect(await sendStudentCode(getDb(), u.id, address, { ...MAIL, send: s.send, code: () => "123456", now })).toEqual({ ok: true, id: "em_1" });
    expect(s.sent[0].to).toBe(address);
    return confirmStudentCode(getDb(), u.id, "123456", now);
  };

  it("refuses with no code at all, and Stripe is never called", async () => {
    const stripe = fakeStripe();
    const u = await as("student");
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(stripe.calls).toHaveLength(0);
  });

  it("refuses a sent but unconfirmed code, a wrong code and an expired code", async () => {
    const stripe = fakeStripe();
    const u = await as("student");
    const s = sender();
    await sendStudentCode(getDb(), u.id, uniqueKid(), { ...MAIL, send: s.send, code: () => "123456" });
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(await confirmStudentCode(getDb(), u.id, "000000")).toEqual({ ok: false, reason: "wrong" });
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(await confirmStudentCode(getDb(), u.id, "123456", Date.now() + 11 * 60_000)).toEqual({ ok: false, reason: "expired" });
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(stripe.calls).toHaveLength(0);
  });

  it("a correct code allows one checkout only; a reused code and a second payment need a fresh one", async () => {
    const stripe = fakeStripe();
    const u = await as("student");
    expect(await verified(u)).toEqual({ ok: true });
    expect(await confirmStudentCode(getDb(), u.id, "123456")).toEqual({ ok: false, reason: "none" }); // reused
    const url = await startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    expect(url).toBe("https://checkout.stripe.test/c/1");
    expect(stripe.calls[0].get("metadata[student_verified_at]")).toMatch(/^\d{4}-/);
    expect(JSON.stringify([...stripe.calls[0]])).not.toContain("school.edu");
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 429 }); // one open checkout
    await freeSlot(u);
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(stripe.calls).toHaveLength(1);
    // a new payment asks for a new code
    await freeSlot(u);
    expect(await verified(u)).toEqual({ ok: true });
    await startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    expect(stripe.calls).toHaveLength(2);
  });

  it("keeps the confirmation when Stripe fails, and a confirmation goes stale after 30 minutes", async () => {
    const u = await as("student");
    expect(await verified(u)).toEqual({ ok: true });
    const broken = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: broken })).rejects.toMatchObject({ status: 502 });
    // a failed start gives the open-checkout slot back too
    const stripe = fakeStripe();
    await startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    expect(stripe.calls).toHaveLength(1);
    const old = await as("student");
    expect(await verified(old, Date.now() - 40 * 60_000)).toEqual({ ok: true });
    await expect(startPlanCheckout(getDb(), old, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect((await studentVerificationState(getDb(), old.id)).step).toBe("none");
  });

  it("a standard user posting the student plan is refused, even with a confirmed row", async () => {
    const stripe = fakeStripe();
    const u = await as("working");
    await getDb()
      .insert(studentVerifications)
      .values({ userId: u.id, email: "x@school.edu", codeHash: "", expiresAt: new Date(Date.now() + 1e6), verifiedAt: new Date() });
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 400 });
    expect(stripe.calls).toHaveLength(0);
  });

  it("sends only with the provider's id, hides the address and rejects junk addresses", async () => {
    const u = await as("student");
    const noId = (async () => ({ id: "" })) as never;
    expect(await sendStudentCode(getDb(), u.id, uniqueKid(), { ...MAIL, send: noId })).toEqual({ ok: false, reason: "failed" });
    expect(await sendStudentCode(getDb(), u.id, "not an address", { ...MAIL, send: noId })).toEqual({ ok: false, reason: "invalid" });
    expect(await sendStudentCode(getDb(), u.id, uniqueKid(), { config: null })).toEqual({ ok: false, reason: "unavailable" });
    await sendStudentCode(getDb(), u.id, uniqueKid(), { ...MAIL, send: sender().send, code: () => "654321" });
    const st = await studentVerificationState(getDb(), u.id);
    expect(st).toEqual({ step: "sent", masked: "ki***@school.edu" });
    const [raw] = await getDb()
      .execute(sql`select email from student_verifications where account_id = ${u.id}`)
      .then((r) => r.rows);
    expect(String((raw as { email: string }).email)).not.toContain("school.edu"); // encrypted at rest
  });
});

describe("one open checkout at a time", () => {
  it("refuses a second checkout in a row without calling Stripe, and a failed start gives the slot back", async () => {
    const stripe = fakeStripe();
    const u = await as("working");
    await startPlanCheckout(getDb(), u, "standard_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    await expect(startPlanCheckout(getDb(), u, "standard_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 429 });
    expect(stripe.calls).toHaveLength(1);
    const v = await as("working");
    const broken = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(startPlanCheckout(getDb(), v, "standard_openai", { cfg: CFG, fetchImpl: broken })).rejects.toMatchObject({ status: 502 });
    await startPlanCheckout(getDb(), v, "standard_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    expect(stripe.calls).toHaveLength(2);
  });
});

describe("the restore after a failed student checkout", () => {
  it("frees only the confirmation it spent, never a newer one", async () => {
    const u = await as("student");
    const db = getDb();
    const t1 = new Date(Date.now() - 60_000);
    const row = { userId: u.id, email: "s@school.edu", codeHash: "", expiresAt: new Date(Date.now() + 1e6) };
    await db.insert(studentVerifications).values({ ...row, verifiedAt: t1 });
    // while checkout A is at Stripe, a second confirmation arrives and a second checkout spends it
    const t2 = new Date();
    const failing = (async () => {
      await db
        .update(studentVerifications)
        .set({ verifiedAt: t2, usedAt: new Date(t2.getTime() + 5) })
        .where(eq(studentVerifications.userId, u.id));
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    await expect(startPlanCheckout(db, u, "student_openai", { cfg: CFG, fetchImpl: failing })).rejects.toMatchObject({ status: 502 });
    const [after] = await db.select().from(studentVerifications).where(eq(studentVerifications.userId, u.id));
    expect(after.usedAt).not.toBeNull();
    expect(after.verifiedAt?.getTime()).toBe(t2.getTime());
  });
});

describe("only a school address gets a code", () => {
  it("refuses gmail, lookalikes and spaces before any send, and accepts the school list", async () => {
    const mail = { config: { apiKey: "k", from: "a@b.test" } as never };
    const u = await as("student");
    const sent: string[] = [];
    const send = (async (_c: unknown, m: { to: string }) => (sent.push(m.to), { id: "em" })) as never;
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    for (const bad of ["kid@gmail.com", "kid@school.edu.evil.com", "kid @school.edu"])
      expect(await sendStudentCode(getDb(), u.id, bad, { ...mail, send })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
    expect(await sendStudentCode(getDb(), u.id, "kid@gmail.com", { ...mail, send })).toEqual({ ok: false, reason: "not_school" });
    for (const good of ["mit.edu", "unsw.edu.au", "ox.ac.uk", "mcgill.ca"].map((d) => `a${stamp}@${d}`)) {
      const v = await as("student");
      expect(await sendStudentCode(getDb(), v.id, good, { ...mail, send })).toMatchObject({ ok: true });
    }
    expect(sent).toEqual(["mit.edu", "unsw.edu.au", "ox.ac.uk", "mcgill.ca"].map((d) => `a${stamp}@${d}`));
  });
});

describe("student code email limits", () => {
  it("refuses the fourth send to one address in a day, across accounts, without calling the provider", async () => {
    const mail = { config: { apiKey: "k", from: "a@b.test" } as never };
    let calls = 0;
    const send = (async () => (calls++, { id: "em" })) as never;
    const address = `Flood${Date.now()}${Math.floor(Math.random() * 1e6)}@School.edu`;
    for (let i = 0; i < 3; i++) {
      const u = await as("student");
      expect(await sendStudentCode(getDb(), u.id, address, { ...mail, send })).toMatchObject({ ok: true });
    }
    const fourth = await as("student");
    expect(await sendStudentCode(getDb(), fourth.id, address.toLowerCase(), { ...mail, send })).toEqual({ ok: false, reason: "too_many" });
    expect(calls).toBe(3);
  });
  it("refuses a send over the per-network limit", async () => {
    const mail = { config: { apiKey: "k", from: "a@b.test" } as never };
    const ip = `203.0.113.${Math.floor(Math.random() * 200)}-${Date.now()}`;
    let calls = 0;
    const send = (async () => (calls++, { id: "em" })) as never;
    let last: unknown;
    for (let i = 0; i < 31; i++) {
      const u = await as("student");
      last = await sendStudentCode(getDb(), u.id, `n${i}-${Date.now()}@school.edu`, { ...mail, send, ip });
    }
    expect(last).toEqual({ ok: false, reason: "too_many" });
    expect(calls).toBe(30);
  });
});

describe("account confirmation code limits", () => {
  it("refuses the fourth send to one address in a day without calling the provider", async () => {
    const mail = { config: { apiKey: "k", from: "a@b.test" } as never };
    let calls = 0;
    const send = (async () => (calls++, { id: "em" })) as never;
    const u = await as("student");
    const results = [];
    for (let i = 0; i < 4; i++) {
      // a different hour's allowance each time is not needed: the address limit is the day's 3, the person's hourly limit is 3 too
      results.push(await sendConfirmCode(getDb(), u.id, { ...mail, send }));
    }
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toEqual({ ok: false, reason: "too_many" });
    expect(calls).toBe(3);
  });
});

describe("a person who already has a plan", () => {
  it("is refused any plan, with a fixed message, and Stripe is never called", async () => {
    const stripe = fakeStripe();
    const u = await as("student");
    await getDb().update(users).set({ plan: "pro" }).where(eq(users.id, u.id));
    for (const key of ["student_openai", "standard_openai", "student_own", "bogus"]) {
      await expect(startPlanCheckout(getDb(), u, key, { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({
        status: 409,
        message: "You already have a plan. Use Manage or cancel to change it.",
      });
    }
    expect(stripe.calls).toHaveLength(0);
  });
});

describe("the webhook for a plan purchase", () => {
  const live = (status: string) =>
    (async () => new Response(JSON.stringify({ data: [{ id: "s1", status }], has_more: false }), { status: 200 })) as unknown as typeof fetch;

  it("grants the plan only from the signed event plus a live read of the subscription", async () => {
    const u = await as("student");
    const db = getDb();
    const customer = `cus_${u.id}`;
    const event = { type: "checkout.session.completed", data: { object: { client_reference_id: u.id, customer, metadata: { plan: "student_openai" } } } };
    const plan = async () => (await db.select({ p: users.plan }).from(users).where(eq(users.id, u.id)))[0].p;
    // a checkout whose subscription isn't active grants nothing
    await applyStripeEvent(db, event, { cfg: CFG, fetchImpl: live("incomplete") });
    expect(await plan()).toBe("free");
    await applyStripeEvent(db, event, { cfg: CFG, fetchImpl: live("active") });
    expect(await plan()).toBe("pro");
  });

  it("never touches another person's plan, and past_due or a deleted subscription means free", async () => {
    const a = await as("student");
    const b = await as("student");
    const db = getDb();
    const cust = (u: { id: string }) => `cus_${u.id}`;
    const ev = (u: { id: string }) => ({ type: "customer.subscription.updated", data: { object: { customer: cust(u) } } });
    const plan = async (u: { id: string }) => (await db.select({ p: users.plan }).from(users).where(eq(users.id, u.id)))[0].p;
    await db
      .update(users)
      .set({ stripeCustomerId: cust(a), plan: "pro" })
      .where(eq(users.id, a.id));
    await db
      .update(users)
      .set({ stripeCustomerId: cust(b), plan: "pro" })
      .where(eq(users.id, b.id));
    await applyStripeEvent(db, ev(a), { cfg: CFG, fetchImpl: live("past_due") });
    expect(await plan(a)).toBe("free");
    expect(await plan(b)).toBe("pro");
    await db.update(users).set({ plan: "pro" }).where(eq(users.id, a.id));
    await applyStripeEvent(db, { type: "customer.subscription.deleted", data: { object: { customer: cust(a) } } }, { cfg: CFG, fetchImpl: live("canceled") });
    expect(await plan(a)).toBe("free");
    expect(await plan(b)).toBe("pro");
    // a customer id that belongs to nobody changes nobody
    await applyStripeEvent(
      db,
      { type: "customer.subscription.deleted", data: { object: { customer: "cus_nobody" } } },
      { cfg: CFG, fetchImpl: live("canceled") },
    );
    expect(await plan(b)).toBe("pro");
  });

  it("rejects an unsigned or wrongly signed event without changing anything", async () => {
    const u = await as("student");
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: u.id, customer: "cus_x" } } });
    const prior = { ...process.env };
    Object.assign(process.env, {
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec",
      STRIPE_PRICE_ID: "price_1",
      APP_URL: "https://lifeflow.test",
    });
    try {
      const t = Math.floor(Date.now() / 1000);
      const bad = createHmac("sha256", "other").update(`${t}.${body}`).digest("hex");
      const res = await POST(new Request("http://x/api/billing/webhook", { method: "POST", body, headers: { "stripe-signature": `t=${t},v1=${bad}` } }));
      expect(res.status).toBe(400);
      const none = await POST(new Request("http://x/api/billing/webhook", { method: "POST", body }));
      expect(none.status).toBe(400);
      const [row] = await getDb().select({ p: users.plan, c: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
      expect(row).toEqual({ p: "free", c: null });
    } finally {
      for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "APP_URL"]) {
        if (prior[k] === undefined) delete process.env[k];
        else process.env[k] = prior[k];
      }
    }
  });
});
