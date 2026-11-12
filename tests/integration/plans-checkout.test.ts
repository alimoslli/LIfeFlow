import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { applyStripeEvent } from "@/server/billing";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { plansConfig, startPlanCheckout, type PlanKey } from "@/server/plans";
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
