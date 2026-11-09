import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { SessionUser } from "./auth/sessions";
import type { Database } from "./db/client";
import { users } from "./db/schema";
import { HttpError } from "./http";

/**
 * LifeFlow Pro (ADR 0018). Free: everything you enter yourself, Jarvis with a daily
 * limit. Pro: connections (bank, Google), texting and voice, unlimited Jarvis.
 * Until Stripe is configured, nothing is limited, so the owner can test everything.
 */
export type BillingConfig = { secretKey: string; webhookSecret: string; priceId: string; appUrl: string };

export function billingConfig(env: Record<string, string | undefined> = process.env): BillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const priceId = env.STRIPE_PRICE_ID?.trim();
  const appUrl = env.APP_URL?.trim().replace(/\/$/, "");
  return secretKey && webhookSecret && priceId && appUrl ? { secretKey, webhookSecret, priceId, appUrl } : null;
}

export const FREE_JARVIS_PER_DAY = 15;

/**
 * While paid plans are off (testing), everyone gets every feature within these limits, so one
 * person costs at most a few dollars a month (target: $2 to $7).
 * - Messages: a dollar cap on the skyling's own measured cost (jarvis_runs.cost_micros, set when
 *   model prices are configured), plus day and 30-day counts as a floor when they aren't.
 * - Voice: calls and call length, because a call streams straight between the phone and the
 *   voice service and its cost isn't measured: at most 10 calls x 3 minutes = 30 minutes a month.
 */
export const TESTING_LIMITS = {
  messagesPerDay: 30,
  messagesPerMonth: 300,
  assistantDollarsPerMonth: 4,
  voiceCallsPerDay: 2,
  voiceCallsPerMonth: 10,
  voiceCallMinutes: 3,
} as const;

/** "Month" for limits: a rolling-ish 30-day window. */
export const LIMIT_MONTH_SECONDS = 30 * 86_400;

/** True while paid plans are switched off. */
export const inTestingPhase = (cfg = billingConfig()) => !cfg;

/** The message shown when a testing limit is reached. */
export function testingLimitMessage(what: "messages" | "voice calls", limit: number, retryAfterSeconds: number, period: "day" | "month" = "day") {
  const hours = Math.max(1, Math.ceil(retryAfterSeconds / 3600));
  const when = hours <= 36 ? `about ${hours} hour${hours === 1 ? "" : "s"}` : `about ${Math.ceil(hours / 24)} days`;
  const span = period === "day" ? "today's" : "this month's";
  return `You've used ${span} ${limit} ${what}. While LifeFlow is in testing, everyone gets ${limit} a ${period}. More open up in ${when}.`;
}

/** Shown when the monthly assistant budget is used up. */
export const TESTING_BUDGET_MESSAGE =
  "You've reached this month's skyling limit while LifeFlow is in testing. It frees up again over the next few days as older use rolls off. Everything else in the app keeps working.";
export const PRO_FEATURES = {
  bank: "Bank sync",
  google: "Gmail and Google Calendar",
  microsoft: "Microsoft Teams and Outlook",
  sms: "Texting",
  voice: "Voice",
} as const;

export const isPro = (user: Pick<SessionUser, "plan" | "accountKind">, cfg = billingConfig()) => !cfg || user.plan === "pro" || user.accountKind === "demo";

/** Throws a 402 with a plain message when a Pro feature is used on the free plan. */
export function requirePro(user: Pick<SessionUser, "plan" | "accountKind">, feature: keyof typeof PRO_FEATURES) {
  if (!isPro(user)) throw new HttpError(402, `${PRO_FEATURES[feature]} is part of LifeFlow Pro. Upgrade in Settings → Plan.`);
}

async function stripe(cfg: BillingConfig, path: string, params: Record<string, string>, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.secretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) {
    console.error("[stripe]", path, res.status, json.error?.message);
    throw new HttpError(502, "Payments aren't available right now. Try again in a bit.");
  }
  return json.url;
}

/** Cancels every live subscription of a Stripe customer right away (used when an account is deleted), following Stripe's paging. Returns how many were cancelled. Throws on any failure. */
export async function cancelSubscriptionsNow(cfg: BillingConfig, customerId: string, fetchImpl: typeof fetch = fetch) {
  const headers = { authorization: `Bearer ${cfg.secretKey}` };
  const live: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const url: string = `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`;
    const list = await fetchImpl(url, { headers });
    const body = (await list.json().catch(() => ({}))) as { data?: { id?: string; status?: string }[]; has_more?: boolean };
    if (!list.ok || !Array.isArray(body.data)) throw new Error("Stripe subscription list failed");
    for (const s of body.data) if (typeof s.id === "string" && s.status !== "canceled" && s.status !== "incomplete_expired") live.push(s.id);
    if (!body.has_more) break;
    const last: string | undefined = body.data[body.data.length - 1]?.id;
    if (!last) throw new Error("Stripe paging failed");
    after = last;
  }
  for (const id of live) {
    const res = await fetchImpl(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Stripe cancel failed");
  }
  return live.length;
}

/** A Stripe Checkout page for Pro. The webhook (not this redirect) turns Pro on. */
export function checkoutUrl(cfg: BillingConfig, user: { id: string; email: string; stripeCustomerId: string | null }, fetchImpl?: typeof fetch) {
  return stripe(
    cfg,
    "checkout/sessions",
    {
      mode: "subscription",
      "line_items[0][price]": cfg.priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      allow_promotion_codes: "true",
      success_url: `${cfg.appUrl}/settings/plan?upgraded=1`,
      cancel_url: `${cfg.appUrl}/settings/plan`,
    },
    fetchImpl,
  );
}

/** Stripe's customer portal: change card, cancel, invoices. */
export function portalUrl(cfg: BillingConfig, customerId: string, fetchImpl?: typeof fetch) {
  return stripe(cfg, "billing_portal/sessions", { customer: customerId, return_url: `${cfg.appUrl}/settings/plan` }, fetchImpl);
}

/** Stripe-Signature: "t=<time>,v1=<hmac>". HMAC-SHA256 of "<time>.<raw body>", within 5 minutes. */
export function validStripeEvent(secret: string, rawBody: string, header: string | null, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300 || !parts.v1) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

/** Keeps users.plan in sync with Stripe. Unknown events are ignored. */
export async function applyStripeEvent(db: Database, event: StripeEvent) {
  const o = event.data.object;
  if (event.type === "checkout.session.completed" && typeof o.client_reference_id === "string" && typeof o.customer === "string") {
    await db.update(users).set({ stripeCustomerId: o.customer, plan: "pro" }).where(eq(users.id, o.client_reference_id));
    return "pro";
  }
  if ((event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") && typeof o.customer === "string") {
    const plan = event.type === "customer.subscription.updated" && (o.status === "active" || o.status === "trialing") ? "pro" : "free";
    await db.update(users).set({ plan }).where(eq(users.stripeCustomerId, o.customer));
    return plan;
  }
  return null;
}
