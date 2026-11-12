"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, portalUrl } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/http";
import { confirmStudentCode, sendStudentCode } from "@/server/services/email-confirm";
import { audienceFor, paywallActive, startPlanCheckout } from "@/server/plans";

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

export async function manageBillingAction() {
  const cfg = billingConfig();
  const u = await requireUser();
  const [row] = await getDb().select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
  if (!cfg || !row?.stripeCustomerId) redirect("/settings/plan");
  redirect(await portalUrl(cfg, row.stripeCustomerId));
}
