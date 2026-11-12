import type { SessionUser } from "./auth/sessions";
import { eq } from "drizzle-orm";
import { billingConfig, checkoutUrl, type BillingConfig } from "./billing";
import type { Database } from "./db/client";
import { users } from "./db/schema";
import { HttpError } from "./http";

/**
 * The two plans and the paywall (owner, 2026-11-12). All of it sits behind one switch that is OFF unless
 * PLANS_PAYWALL=on is set. Off means nothing is sold, no price is shown to a user and no checkout answers.
 * The paywall goes live only with the App Store launch, after the owner's yes on the pictures.
 */
export const plansEnabled = (env: Record<string, string | undefined> = process.env) => env.PLANS_PAYWALL?.trim().toLowerCase() === "on";

export type PlanKey = "student_own" | "student_openai" | "standard_own" | "standard_openai";
export type Audience = "student" | "standard";

/** Monthly prices in integer cents. The one price table. */
export const PLAN_PRICE_CENTS: Record<PlanKey, number> = {
  student_own: 599,
  student_openai: 999,
  standard_own: 999,
  standard_openai: 1499,
};

/**
 * The plan that runs on the skyling's own model stays hidden until the owner turns on its own condition (an open model
 * passing our eval and situations on our servers, a data agreement and the privacy page changed first). Do not flip this
 * without that yes; checkout refuses these plans while it is false.
 */
export const OWN_MODEL_PLAN_SELLABLE = false;

/**
 * Placeholder: the share of a plan's price that skyling model cost may take. UNCONFIRMED BY THE OWNER.
 * Not enforced anywhere; kept here so the number lives in one place until he decides.
 */
export const AI_COST_SHARE_OF_PRICE = 0.4;

export const PLAN_NAMES: Record<PlanKey, { title: string; blurb: string }> = {
  student_own: { title: "LifeFlow Pro", blurb: "Your skyling on its own model." },
  student_openai: { title: "LifeFlow Pro Plus", blurb: "Your skyling on OpenAI's model." },
  standard_own: { title: "LifeFlow Pro", blurb: "Your skyling on its own model." },
  standard_openai: { title: "LifeFlow Pro Plus", blurb: "Your skyling on OpenAI's model." },
};

export function audienceFor(user: Pick<SessionUser, "preferences">): Audience {
  const stage = user.preferences?.lifeStage;
  return stage === "student" || stage === "both" ? "student" : "standard";
}

export type PlanOption = { key: PlanKey; cents: number; title: string; blurb: string; priceLabel: string };

export const priceLabel = (cents: number) => `$${(cents / 100).toFixed(2)} a month`;

/** What a person may be offered. Nothing at all while the switch is off. */
export function planOptions(audience: Audience, opts: { enabled?: boolean; ownModelSellable?: boolean } = {}): PlanOption[] {
  const enabled = opts.enabled ?? plansEnabled();
  if (!enabled) return [];
  const own = opts.ownModelSellable ?? OWN_MODEL_PLAN_SELLABLE;
  const keys: PlanKey[] = audience === "student" ? ["student_own", "student_openai"] : ["standard_own", "standard_openai"];
  return keys
    .filter((k) => own || !k.endsWith("_own"))
    .map((key) => ({ key, cents: PLAN_PRICE_CENTS[key], ...PLAN_NAMES[key], priceLabel: priceLabel(PLAN_PRICE_CENTS[key]) }));
}

export type PlansConfig = BillingConfig & { prices: Record<PlanKey, string | undefined> };

const PRICE_ENV: Record<PlanKey, string> = {
  student_own: "STRIPE_PRICE_STUDENT_OWN",
  student_openai: "STRIPE_PRICE_STUDENT_OPENAI",
  standard_own: "STRIPE_PRICE_STANDARD_OWN",
  standard_openai: "STRIPE_PRICE_STANDARD_OPENAI",
};

/**
 * Null unless the switch is on and Stripe is set up. Only a TEST-mode secret key is accepted: a live key makes this
 * null, so live prices cannot be sold through this path and test and live stay apart.
 */
export function plansConfig(env: Record<string, string | undefined> = process.env): PlansConfig | null {
  if (!plansEnabled(env)) return null;
  const base = billingConfig(env);
  if (!base || !/^(sk|rk)_test_/.test(base.secretKey)) return null;
  const prices = Object.fromEntries((Object.keys(PRICE_ENV) as PlanKey[]).map((k) => [k, env[PRICE_ENV[k]]?.trim() || undefined])) as PlansConfig["prices"];
  return { ...base, prices };
}

/** The Stripe price for a plan this person may buy, or null (switch off, hidden plan, wrong audience, price not set). */
export function priceIdFor(cfg: PlansConfig | null, audience: Audience, key: string): string | null {
  if (!cfg) return null;
  const allowed = planOptions(audience, { enabled: true }).find((o) => o.key === key);
  return allowed ? (cfg.prices[allowed.key] ?? null) : null;
}

/**
 * Starts a Stripe Checkout for one plan. Refuses (404) while the switch is off, and (400) for a plan this person may not buy.
 * The price id comes from our own table, never from the browser. The plan itself is still granted only by the signed webhook.
 */
export async function startPlanCheckout(
  db: Database,
  user: Pick<SessionUser, "id" | "email" | "preferences">,
  key: string,
  opts: { cfg?: PlansConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const cfg = opts.cfg === undefined ? plansConfig() : opts.cfg;
  if (!cfg) throw new HttpError(404, "Not found");
  const priceId = priceIdFor(cfg, audienceFor(user), key);
  if (!priceId) throw new HttpError(400, "That plan isn't available.");
  const [row] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, user.id));
  return checkoutUrl(cfg, { id: user.id, email: user.email, stripeCustomerId: row?.stripeCustomerId ?? null }, opts.fetchImpl, priceId);
}
