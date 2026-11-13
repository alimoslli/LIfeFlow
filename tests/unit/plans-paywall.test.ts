import { afterEach, describe, expect, it, vi } from "vitest";
import { billingConfig, checkoutUrl, inTestingPhase, isPro, legacyBilling, paywallActive } from "@/server/billing";
import { planOptions, plansConfig, plansEnabled, priceIdFor } from "@/server/plans";

const ENV = {
  PLANS_PAYWALL: "on",
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec",
  APP_URL: "https://lifeflow.test",
  STRIPE_PRICE_STUDENT_OPENAI: "price_sa",
  STRIPE_PRICE_STANDARD_OPENAI: "price_na",
};
const free = { plan: "free" as const, accountKind: "real" as never };

afterEach(() => vi.unstubAllEnvs());

describe("the switch is exactly on", () => {
  it('" On ", "ON", "1", "off" and "" are all off', () => {
    for (const v of [" On ", "ON", "On", "1", "true", "off", "", " on", "on "]) expect(plansEnabled({ PLANS_PAYWALL: v })).toBe(false);
    expect(plansEnabled({ PLANS_PAYWALL: "on" })).toBe(true);
  });
});

describe("switch off with Stripe plan prices set behaves as on main", () => {
  const off = { ...ENV, PLANS_PAYWALL: "off" };
  it("a free user keeps every feature and the testing limits apply", () => {
    const cfg = billingConfig(off);
    expect(cfg).toBeNull();
    expect(isPro(free, cfg)).toBe(true);
    expect(inTestingPhase(cfg)).toBe(true);
    expect(paywallActive(off)).toBe(false);
  });
  it("reads the real process env too (PLANS_PAYWALL set explicitly, not the runner's)", () => {
    vi.stubEnv("PLANS_PAYWALL", "off");
    for (const [k, v] of Object.entries(ENV)) if (k !== "PLANS_PAYWALL") vi.stubEnv(k, v);
    expect(isPro(free)).toBe(true);
    expect(inTestingPhase()).toBe(true);
    vi.stubEnv("PLANS_PAYWALL", "on");
    expect(isPro(free)).toBe(false);
    expect(inTestingPhase()).toBe(false);
  });
  it("the old single price still locks, as before", () => {
    const cfg = billingConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_ID: "price_1", APP_URL: "https://x.test" });
    expect(isPro(free, cfg)).toBe(false);
  });
});

describe("the old single-price setup keeps its upgrade path", () => {
  const LEGACY = {
    STRIPE_SECRET_KEY: "sk_live_x",
    STRIPE_WEBHOOK_SECRET: "wh",
    STRIPE_PRICE_ID: "price_legacy",
    APP_URL: "https://x.test",
    PLANS_PAYWALL: "off",
  };
  it("with the switch off the legacy config is there, locks free users, and starts a checkout at the legacy price", async () => {
    expect(paywallActive(LEGACY)).toBe(false);
    const cfg = legacyBilling(LEGACY);
    expect(cfg).not.toBeNull();
    expect(isPro(free, billingConfig(LEGACY))).toBe(false);
    let body = "";
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ url: "https://checkout.stripe.test/legacy" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await checkoutUrl(cfg!, { id: "u", email: "a@b.test", stripeCustomerId: null }, fetchImpl)).toBe("https://checkout.stripe.test/legacy");
    expect(new URLSearchParams(body).get("line_items[0][price]")).toBe("price_legacy");
  });
  it("plan prices alone are not the legacy setup", () => {
    expect(legacyBilling({ ...ENV, PLANS_PAYWALL: "off" })).toBeNull();
  });
});

describe("switch on with the same config locks the free user", () => {
  it("applies the lock and ends the testing limits", () => {
    const cfg = billingConfig(ENV);
    expect(isPro(free, cfg)).toBe(false);
    expect(isPro({ ...free, plan: "pro" }, cfg)).toBe(true);
    expect(inTestingPhase(cfg)).toBe(false);
  });
});

describe("a live key with the switch on: no prices, no lock", () => {
  it.each(["sk_live_abc", "rk_live_abc", "SK_TEST_abc", "sk-test-abc", ""])("key %j", (key) => {
    const env = { ...ENV, STRIPE_SECRET_KEY: key };
    expect(paywallActive(env)).toBe(false);
    expect(plansConfig(env)).toBeNull();
    expect(billingConfig(env)).toBeNull();
    expect(isPro(free, billingConfig(env))).toBe(true);
    expect(inTestingPhase(billingConfig(env))).toBe(true);
  });
  it("a missing key is not active", () => {
    const { STRIPE_SECRET_KEY: _k, ...env } = ENV;
    expect(plansConfig(env)).toBeNull();
    expect(paywallActive(env)).toBe(false);
  });
  it("rk_test_ is accepted, and a leading space is trimmed before the check", () => {
    expect(plansConfig({ ...ENV, STRIPE_SECRET_KEY: "rk_test_abc" })).not.toBeNull();
    expect(plansConfig({ ...ENV, STRIPE_SECRET_KEY: " sk_test_abc" })?.secretKey).toBe("sk_test_abc");
    expect(plansConfig({ ...ENV, STRIPE_SECRET_KEY: " sk_live_abc" })).toBeNull();
  });
  it("a live key with the switch on shows no price", () => {
    expect(planOptions("student", { enabled: paywallActive({ ...ENV, STRIPE_SECRET_KEY: "sk_live_abc" }) })).toEqual([]);
  });
});

describe("test keys in production", () => {
  it("are refused on Vercel production or NODE_ENV production", () => {
    expect(plansConfig({ ...ENV, VERCEL_ENV: "production" })).toBeNull();
    expect(plansConfig({ ...ENV, NODE_ENV: "production" })).toBeNull();
    expect(paywallActive({ ...ENV, VERCEL_ENV: "production" })).toBe(false);
    expect(billingConfig({ ...ENV, VERCEL_ENV: "production" })).toBeNull();
  });
  it("a preview deploy shares the production database, so it is refused too", () => {
    expect(plansConfig({ ...ENV, VERCEL_ENV: "preview" })).toBeNull();
    expect(paywallActive({ ...ENV, VERCEL_ENV: "preview" })).toBe(false);
  });
  it("work in development or with the explicit override", () => {
    expect(plansConfig({ ...ENV, VERCEL_ENV: "development" })).not.toBeNull();
    expect(plansConfig({ ...ENV, VERCEL_ENV: "preview", PLANS_ALLOW_TEST_KEYS_IN_PRODUCTION: "yes" })).not.toBeNull();
    expect(plansConfig({ ...ENV, VERCEL_ENV: "production", PLANS_ALLOW_TEST_KEYS_IN_PRODUCTION: "yes" })).not.toBeNull();
  });
});

describe("a crafted plan id", () => {
  it("is refused whatever it looks like", () => {
    const cfg = plansConfig(ENV);
    for (const key of ["price_live_x", "price_sa", "student_openai ", "STUDENT_OPENAI", "student_openai\n"]) expect(priceIdFor(cfg, "student", key)).toBeNull();
  });
});
