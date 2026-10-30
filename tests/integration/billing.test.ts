import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
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

  it("keeps the plan in sync with the subscription", async () => {
    const { user } = await makeUser();
    const db = getDb();
    const plan = async () => (await db.select({ p: users.plan }).from(users).where(eq(users.id, user.id)))[0].p;
    expect(await plan()).toBe("free");
    await applyStripeEvent(db, { type: "checkout.session.completed", data: { object: { client_reference_id: user.id, customer: `cus_${user.id}` } } });
    expect(await plan()).toBe("pro");
    await applyStripeEvent(db, { type: "customer.subscription.updated", data: { object: { customer: `cus_${user.id}`, status: "past_due" } } });
    expect(await plan()).toBe("free");
    await applyStripeEvent(db, { type: "customer.subscription.updated", data: { object: { customer: `cus_${user.id}`, status: "active" } } });
    expect(await plan()).toBe("pro");
    await applyStripeEvent(db, { type: "customer.subscription.deleted", data: { object: { customer: `cus_${user.id}` } } });
    expect(await plan()).toBe("free");
  });
});
