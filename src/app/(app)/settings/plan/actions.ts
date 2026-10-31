"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { billingConfig, checkoutUrl, portalUrl } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

export async function upgradeAction() {
  const cfg = billingConfig();
  const u = await requireUser();
  if (!cfg) redirect("/settings/plan");
  const [row] = await getDb().select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
  redirect(await checkoutUrl(cfg, { id: u.id, email: u.email, stripeCustomerId: row?.stripeCustomerId ?? null }));
}

export async function manageBillingAction() {
  const cfg = billingConfig();
  const u = await requireUser();
  const [row] = await getDb().select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, u.id));
  if (!cfg || !row?.stripeCustomerId) redirect("/settings/plan");
  redirect(await portalUrl(cfg, row.stripeCustomerId));
}
