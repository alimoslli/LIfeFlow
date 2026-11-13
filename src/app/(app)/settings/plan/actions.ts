"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, checkoutUrl, legacyBilling, portalUrl } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/http";
import { confirmStudentCode, sendStudentCode } from "@/server/services/email-confirm";
import { audienceFor, guardLegacyUpgrade, paywallActive, releaseCheckoutSlot, startPlanCheckout } from "@/server/plans";

/** Buys the plan named by the button (the price comes from our table, never the browser). Nothing happens while the switch is off. */
export async function choosePlanAction(formData: FormData) {
  const u = await requireUser();
  if (!paywallActive()) redirect("/settings");
  let url: string;
  try {
    url = await startPlanCheckout(getDb(), u, String(formData.get("plan") ?? ""));
  } catch (e) {
    if (e instanceof HttpError) redirect("/settings/plan?problem=1");
    throw e;
  }
  redirect(url);
}

/** Student price, step 1: a code to any student address they type (the page never shows it back in full). */
export async function sendStudentCodeAction(formData: FormData) {
  const u = await requireUser();
  if (!paywallActive() || audienceFor(u) !== "student") redirect("/settings");
  const r = await sendStudentCode(getDb(), u.id, String(formData.get("email") ?? "").slice(0, 300));
  redirect(`/settings/plan?student=${r.ok ? "sent" : r.reason}`);
}

/** Student price, step 2: the code. Right once, then one checkout. */
export async function confirmStudentCodeAction(formData: FormData) {
  const u = await requireUser();
  if (!paywallActive() || audienceFor(u) !== "student") redirect("/settings");
  const r = await confirmStudentCode(getDb(), u.id, String(formData.get("code") ?? "").slice(0, 20));
  redirect(`/settings/plan?student=${r.ok ? "verified" : r.reason}`);
}

/** The old single-price upgrade, kept for a setup that only has STRIPE_PRICE_ID (it works whatever the plans switch says). */
export async function upgradeAction() {
  const cfg = legacyBilling();
  const u = await requireUser();
  if (!cfg) redirect("/settings/plan");
  const db = getDb();
  const [row] = await db.select({ stripeCustomerId: users.stripeCustomerId, plan: users.plan }).from(users).where(eq(users.id, u.id));
  try {
    await guardLegacyUpgrade(db, u.id, row?.plan);
  } catch (e) {
    if (e instanceof HttpError) redirect("/settings/plan?problem=1");
    throw e;
  }
  let url: string;
  try {
    url = await checkoutUrl(cfg, { id: u.id, email: u.email, stripeCustomerId: row?.stripeCustomerId ?? null });
  } catch (e) {
    await releaseCheckoutSlot(db, u.id); // nothing was started, so the slot is free again
    if (e instanceof HttpError) redirect("/settings/plan?problem=1");
    throw e;
  }
  redirect(url);
}

export async function manageBillingAction() {
  const cfg = billingConfig();
  const u = await requireUser();
  const [row] = await getDb().select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
  if (!cfg || !row?.stripeCustomerId) redirect("/settings/plan");
  redirect(await portalUrl(cfg, row.stripeCustomerId));
}
