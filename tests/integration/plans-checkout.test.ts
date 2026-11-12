import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { applyStripeEvent } from "@/server/billing";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { plansConfig, startPlanCheckout, type PlanKey } from "@/server/plans";
import { confirmStudentCode, sendStudentCode, studentVerificationState } from "@/server/services/email-confirm";
import { studentVerifications } from "@/server/db/schema";
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
        await getDb()
          .insert(studentVerifications)
          .values({ userId: u.id, email: "s@school.example", codeHash: "", expiresAt: new Date(), verifiedAt: new Date() });
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

describe("the student price needs a confirmed student email", () => {
  const MAIL = { config: { apiKey: "k", from: "a@b.test" } as never };
  const sender = () => {
    const sent: { to: string }[] = [];
    return { sent, send: (async (_c: unknown, m: { to: string }) => (sent.push({ to: m.to }), { id: "em_1" })) as never };
  };
  const verified = async (u: { id: string }, now = Date.now()) => {
    const s = sender();
    expect(await sendStudentCode(getDb(), u.id, "kid@school.example", { ...MAIL, send: s.send, code: () => "123456", now })).toEqual({ ok: true, id: "em_1" });
    expect(s.sent[0].to).toBe("kid@school.example");
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
    await sendStudentCode(getDb(), u.id, "kid@school.example", { ...MAIL, send: s.send, code: () => "123456" });
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
    expect(JSON.stringify([...stripe.calls[0]])).not.toContain("school.example");
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 403 });
    expect(stripe.calls).toHaveLength(1);
    // a new payment asks for a new code
    expect(await verified(u)).toEqual({ ok: true });
    await startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl });
    expect(stripe.calls).toHaveLength(2);
  });

  it("keeps the confirmation when Stripe fails, and a confirmation goes stale after 30 minutes", async () => {
    const u = await as("student");
    expect(await verified(u)).toEqual({ ok: true });
    const broken = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: broken })).rejects.toMatchObject({ status: 502 });
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
      .values({ userId: u.id, email: "x@school.example", codeHash: "", expiresAt: new Date(Date.now() + 1e6), verifiedAt: new Date() });
    await expect(startPlanCheckout(getDb(), u, "student_openai", { cfg: CFG, fetchImpl: stripe.fetchImpl })).rejects.toMatchObject({ status: 400 });
    expect(stripe.calls).toHaveLength(0);
  });

  it("sends only with the provider's id, hides the address and rejects junk addresses", async () => {
    const u = await as("student");
    const noId = (async () => ({ id: "" })) as never;
    expect(await sendStudentCode(getDb(), u.id, "kid@school.example", { ...MAIL, send: noId })).toEqual({ ok: false, reason: "failed" });
    expect(await sendStudentCode(getDb(), u.id, "not an address", { ...MAIL, send: noId })).toEqual({ ok: false, reason: "invalid" });
    expect(await sendStudentCode(getDb(), u.id, "kid@school.example", { config: null })).toEqual({ ok: false, reason: "unavailable" });
    await sendStudentCode(getDb(), u.id, "kid@school.example", { ...MAIL, send: sender().send, code: () => "654321" });
    const st = await studentVerificationState(getDb(), u.id);
    expect(st).toEqual({ step: "sent", masked: "ki***@school.example" });
    const [raw] = await getDb()
      .execute(sql`select email from student_verifications where account_id = ${u.id}`)
      .then((r) => r.rows);
    expect(String((raw as { email: string }).email)).not.toContain("school.example"); // encrypted at rest
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
