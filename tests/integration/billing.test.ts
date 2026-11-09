import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { eq } from "drizzle-orm";
import { applyStripeEvent, billingConfig, isPro, requirePro, validStripeEvent } from "@/server/billing";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { makeUser } from "../helpers";

afterAll(closeDb);
const CFG = billingConfig({ STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec", STRIPE_PRICE_ID: "price_1", APP_URL: "https://lifeflow.test" })!;

describe("LifeFlow Pro", () => {
  it("unlocks everything until Stripe is set up; then only Pro or the demo account", () => {
    const free = { plan: "free" as const, accountKind: "standard" as const };
    expect(isPro(free, null)).toBe(true);
    expect(isPro(free, CFG)).toBe(false);
    expect(isPro({ ...free, plan: "pro" }, CFG)).toBe(true);
    expect(isPro({ ...free, accountKind: "demo" }, CFG)).toBe(true);
    expect(() => requirePro(free, "bank")).not.toThrow(); // no Stripe keys in tests
  });

  it("accepts only Stripe-signed, fresh events", () => {
    const body = JSON.stringify({ type: "x" });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
    expect(validStripeEvent("whsec", body, `t=${t},v1=${sig}`)).toBe(true);
    expect(validStripeEvent("whsec", `${body} `, `t=${t},v1=${sig}`)).toBe(false);
    expect(validStripeEvent("whsec", body, `t=${t - 600},v1=${sig}`)).toBe(false);
    expect(validStripeEvent("whsec", body, null)).toBe(false);
  });

  /** A fake Stripe: the customer's live subscriptions, as `{status}` rows. */
  const stripeWith = (subs: { id: string; status: string }[]) =>
    (async (url: string | URL | Request) => {
      expect(String(url)).toContain("/v1/subscriptions?customer=");
      return new Response(JSON.stringify({ data: subs, has_more: false }), { status: 200 });
    }) as unknown as typeof fetch;
  const down = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
  const ev = (type: string, customer: string, status?: string) => ({ type, data: { object: { customer, ...(status ? { status } : {}) } } });
  const setup = async () => {
    const { user } = await makeUser();
    const db = getDb();
    const customer = `cus_${user.id}`;
    const plan = async () => (await db.select({ p: users.plan }).from(users).where(eq(users.id, user.id)))[0].p;
    expect(await plan()).toBe("free");
    await applyStripeEvent(db, { type: "checkout.session.completed", data: { object: { client_reference_id: user.id, customer } } });
    return { db, customer, plan };
  };

  it("keeps the plan in sync with the live subscription", async () => {
    const { db, customer, plan } = await setup();
    expect(await plan()).toBe("pro");
    await applyStripeEvent(db, ev("customer.subscription.updated", customer, "past_due"), {
      cfg: CFG,
      fetchImpl: stripeWith([{ id: "s1", status: "past_due" }]),
    });
    expect(await plan()).toBe("free");
    await applyStripeEvent(db, ev("customer.subscription.updated", customer, "active"), {
      cfg: CFG,
      fetchImpl: stripeWith([{ id: "s1", status: "trialing" }]),
    });
    expect(await plan()).toBe("pro");
    await applyStripeEvent(db, ev("customer.subscription.deleted", customer), { cfg: CFG, fetchImpl: stripeWith([{ id: "s1", status: "canceled" }]) });
    expect(await plan()).toBe("free");
  });

  it("a late, retried 'deleted' after a resubscribe keeps Pro", async () => {
    const { db, customer, plan } = await setup();
    const subs = [
      { id: "old", status: "canceled" },
      { id: "new", status: "active" },
    ];
    await applyStripeEvent(db, ev("customer.subscription.deleted", customer), { cfg: CFG, fetchImpl: stripeWith(subs) });
    expect(await plan()).toBe("pro");
  });

  it("an out-of-order 'updated (active)' follows the live state, not the event", async () => {
    const { db, customer, plan } = await setup();
    await applyStripeEvent(db, ev("customer.subscription.updated", customer, "active"), {
      cfg: CFG,
      fetchImpl: stripeWith([{ id: "s1", status: "past_due" }]),
    });
    expect(await plan()).toBe("free");
  });

  it("with two subscriptions, deleting one keeps Pro", async () => {
    const { db, customer, plan } = await setup();
    const subs = [
      { id: "a", status: "canceled" },
      { id: "b", status: "active" },
    ];
    await applyStripeEvent(db, ev("customer.subscription.deleted", customer), { cfg: CFG, fetchImpl: stripeWith(subs) });
    expect(await plan()).toBe("pro");
  });

  it("when Stripe can't be read it throws and changes nothing; the webhook answers 500", async () => {
    const { db, customer, plan } = await setup();
    await expect(applyStripeEvent(db, ev("customer.subscription.deleted", customer), { cfg: CFG, fetchImpl: down })).rejects.toThrow(/Stripe/);
    expect(await plan()).toBe("pro");

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("STRIPE_PRICE_ID", "price_1");
    vi.stubEnv("APP_URL", "https://lifeflow.test");
    vi.stubGlobal("fetch", down);
    try {
      const body = JSON.stringify(ev("customer.subscription.deleted", customer));
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
      const res = await POST(
        new Request("https://lifeflow.test/api/billing/webhook", { method: "POST", body, headers: { "stripe-signature": `t=${t},v1=${sig}` } }),
      );
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain(customer);
      expect(await plan()).toBe("pro");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
