import type { SessionUser } from "./auth/sessions";
import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { checkoutUrl, paywallActive, plansBase, plansEnabled, type BillingConfig } from "./billing";
import type { Database } from "./db/client";
import { studentVerifications, users } from "./db/schema";
import { STUDENT_VERIFIED_MS } from "./services/email-confirm";
import { HttpError } from "./http";

/**
 * The two plans and the paywall (owner, 2026-11-12). All of it sits behind one switch that is OFF unless
 * PLANS_PAYWALL=on is set. Off means nothing is sold, no price is shown to a user and no checkout answers.
 * The paywall goes live only with the App Store launch, after the owner's yes on the pictures.
 */
export { paywallActive, plansEnabled };

export const STUDENT_NOT_VERIFIED = "Confirm your student email first.";
export const ALREADY_ON_A_PLAN = "You already have a plan. Use Manage or cancel to change it.";

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
  const base = plansBase(env);
  if (!base) return null;
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
  const [row] = await db.select({ stripeCustomerId: users.stripeCustomerId, plan: users.plan }).from(users).where(eq(users.id, user.id));
  // Never a second subscription for someone who already has one, whatever plan is posted.
  if (row?.plan === "pro") throw new HttpError(409, ALREADY_ON_A_PLAN);
  const priceId = priceIdFor(cfg, audienceFor(user), key);
  if (!priceId) throw new HttpError(400, "That plan isn't available.");
  const customer = { id: user.id, email: user.email, stripeCustomerId: row?.stripeCustomerId ?? null };
  // One open checkout per person: a second one within 30 minutes of the first is refused (an unpaid session is still open at Stripe,
  // and two paid ones would be two subscriptions). A checkout that fails to start gives its slot back.
  await takeCheckoutSlot(db, user.id);
  try {
    if (!key.startsWith("student_")) return await checkoutUrl(cfg, customer, opts.fetchImpl, priceId);
    return await studentCheckout(db, cfg, customer, user.id, priceId, opts.fetchImpl);
  } catch (e) {
    await releaseCheckoutSlot(db, user.id);
    throw e;
  }
}

const CHECKOUT_OPEN_SECONDS = 30 * 60;
export const CHECKOUT_ALREADY_OPEN = "A checkout is already open. Finish it, or try again in a few minutes.";

/**
 * Takes this person's checkout slot: one compare-and-set that sets the expiry to 30 minutes from now only if there is none or it has
 * passed. A refused try changes nothing (so refusals never extend the slot). Throws 429 when the slot is held.
 */
export async function takeCheckoutSlot(db: Database, userId: string) {
  const taken = await db
    .update(users)
    .set({ openCheckoutUntil: sql`now() + make_interval(secs => ${CHECKOUT_OPEN_SECONDS})` })
    .where(and(eq(users.id, userId), or(isNull(users.openCheckoutUntil), lte(users.openCheckoutUntil, sql`now()`))))
    .returning({ id: users.id });
  if (taken.length === 0) throw new HttpError(429, CHECKOUT_ALREADY_OPEN);
}

export async function releaseCheckoutSlot(db: Database, userId: string) {
  await db.update(users).set({ openCheckoutUntil: null }).where(eq(users.id, userId));
}

/** The old single-price upgrade's guard: never a second subscription for a Pro person, and the same one-open-checkout slot. */
export async function guardLegacyUpgrade(db: Database, userId: string, plan: string | undefined) {
  if (plan === "pro") throw new HttpError(409, ALREADY_ON_A_PLAN);
  await takeCheckoutSlot(db, userId);
}

async function studentCheckout(
  db: Database,
  cfg: PlansConfig,
  customer: { id: string; email: string; stripeCustomerId: string | null },
  userId: string,
  priceId: string,
  fetchImpl?: typeof fetch,
) {
  // The student price needs a student address confirmed with a code, spent by this one checkout (so each student payment asks for a
  // fresh code). Stripe's automatic renewals don't ask again: no person is paying then, and the plan page says so.
  const now = new Date();
  const [claimed] = await db
    .update(studentVerifications)
    .set({ usedAt: now })
    .where(
      and(
        eq(studentVerifications.userId, userId),
        isNotNull(studentVerifications.verifiedAt),
        isNull(studentVerifications.usedAt),
        gt(studentVerifications.verifiedAt, new Date(now.getTime() - STUDENT_VERIFIED_MS)),
      ),
    )
    .returning({ verifiedAt: studentVerifications.verifiedAt });
  if (!claimed) throw new HttpError(403, STUDENT_NOT_VERIFIED);
  try {
    // The confirmation's date travels with the checkout, so the payment is bound to the code that allowed it (never the address).
    const stamp = claimed.verifiedAt!.toISOString();
    return await checkoutUrl(cfg, customer, fetchImpl, priceId, {
      "metadata[student_verified_at]": stamp,
      "subscription_data[metadata][student_verified_at]": stamp,
    });
  } catch (e) {
    // Nothing was started, so the confirmation this checkout spent is not used up. Only that one: a newer confirmation (another
    // checkout's) has a different date and stays spent.
    await db
      .update(studentVerifications)
      .set({ usedAt: null })
      .where(and(eq(studentVerifications.userId, userId), eq(studentVerifications.verifiedAt, claimed.verifiedAt!), eq(studentVerifications.usedAt, now)));
    throw e;
  }
}
