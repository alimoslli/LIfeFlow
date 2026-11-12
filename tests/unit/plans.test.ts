import { describe, expect, it } from "vitest";
import {
  AI_COST_SHARE_OF_PRICE,
  OWN_MODEL_PLAN_SELLABLE,
  PLAN_NAMES,
  PLAN_PRICE_CENTS,
  audienceFor,
  planOptions,
  plansConfig,
  plansEnabled,
  priceIdFor,
  priceLabel,
} from "@/server/plans";

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

describe("the price table", () => {
  it("is in integer cents", () => {
    expect(PLAN_PRICE_CENTS).toEqual({ student_own: 599, student_openai: 999, standard_own: 999, standard_openai: 1499 });
    for (const c of Object.values(PLAN_PRICE_CENTS)) expect(Number.isInteger(c)).toBe(true);
    expect(priceLabel(599)).toBe("$5.99 a month");
  });
  it("keeps the unconfirmed cost cap in one place", () => {
    expect(AI_COST_SHARE_OF_PRICE).toBe(0.4);
  });
  it("uses skyling wording and no forbidden words or em dashes", () => {
    const text = JSON.stringify(PLAN_NAMES);
    expect(text).not.toMatch(/assistant|companion|jarvis|—/i);
  });
});

describe("the switch", () => {
  it("is off unless exactly turned on", () => {
    expect(plansEnabled({})).toBe(false);
    expect(plansEnabled({ PLANS_PAYWALL: "off" })).toBe(false);
    expect(plansEnabled({ PLANS_PAYWALL: "1" })).toBe(false);
    expect(plansEnabled({ PLANS_PAYWALL: "on" })).toBe(true);
  });
  it("shows no price and gives no checkout config while off", () => {
    expect(planOptions("student", { enabled: false })).toEqual([]);
    expect(planOptions("standard", { enabled: false })).toEqual([]);
    expect(plansConfig({ ...ENV, PLANS_PAYWALL: undefined })).toBeNull();
    expect(priceIdFor(plansConfig({ ...ENV, PLANS_PAYWALL: "" }), "student", "student_openai")).toBeNull();
  });
  it("defaults off in this process", () => {
    expect(plansEnabled()).toBe(false);
    expect(planOptions("student")).toEqual([]);
  });
});

describe("the picker", () => {
  it("hides the own-model plan in code", () => {
    expect(OWN_MODEL_PLAN_SELLABLE).toBe(false);
    expect(planOptions("student", { enabled: true }).map((o) => [o.key, o.cents])).toEqual([["student_openai", 999]]);
    expect(planOptions("standard", { enabled: true }).map((o) => [o.key, o.cents])).toEqual([["standard_openai", 1499]]);
  });
  it("lists both plans per audience once the own-model plan may be sold", () => {
    expect(planOptions("student", { enabled: true, ownModelSellable: true }).map((o) => o.cents)).toEqual([599, 999]);
    expect(planOptions("standard", { enabled: true, ownModelSellable: true }).map((o) => o.cents)).toEqual([999, 1499]);
  });
  it("treats students (and student-and-working) as students, everyone else as standard", () => {
    expect(audienceFor({ preferences: { lifeStage: "student" } as never })).toBe("student");
    expect(audienceFor({ preferences: { lifeStage: "both" } as never })).toBe("student");
    expect(audienceFor({ preferences: { lifeStage: "working" } as never })).toBe("standard");
    expect(audienceFor({ preferences: undefined })).toBe("standard");
  });
});

describe("the config", () => {
  it("accepts only a test-mode key, so live stays apart", () => {
    expect(plansConfig(ENV)).not.toBeNull();
    expect(plansConfig({ ...ENV, STRIPE_SECRET_KEY: "sk_live_abc" })).toBeNull();
  });
  it("gives a price only for a plan this audience may buy", () => {
    const cfg = plansConfig(ENV);
    expect(priceIdFor(cfg, "student", "student_openai")).toBe("price_sa");
    expect(priceIdFor(cfg, "student", "standard_openai")).toBeNull(); // wrong audience
    expect(priceIdFor(cfg, "student", "student_own")).toBeNull(); // hidden
    expect(priceIdFor(cfg, "standard", "standard_openai")).toBe("price_na");
    expect(priceIdFor(cfg, "standard", "nope")).toBeNull();
    expect(priceIdFor(plansConfig({ ...ENV, STRIPE_PRICE_STANDARD_OPENAI: "" }), "standard", "standard_openai")).toBeNull();
  });
});
