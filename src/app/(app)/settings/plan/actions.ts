"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, portalUrl } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { plansEnabled, startPlanCheckout } from "@/server/plans";

/** Buys the plan named by the button (the price comes from our table, never the browser). Nothing happens while the switch is off. */
export async function choosePlanAction(formData: FormData) {
  const u = await requireUser();
  if (!plansEnabled()) redirect("/settings");
  redirect(await startPlanCheckout(getDb(), u, String(formData.get("plan") ?? "")));
}

export async function manageBillingAction() {
  const cfg = billingConfig();
  const u = await requireUser();
  if (!plansEnabled()) redirect("/settings");
  const [row] = await getDb().select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
  if (!cfg || !row?.stripeCustomerId) redirect("/settings/plan");
  redirect(await portalUrl(cfg, row.stripeCustomerId));
}
