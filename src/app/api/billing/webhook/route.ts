import { NextResponse } from "next/server";
import { applyStripeEvent, billingConfig, validStripeEvent } from "@/server/billing";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** Stripe calls this when a subscription starts, changes or ends. Verified by Stripe's signature. */
export async function POST(req: Request) {
  const cfg = billingConfig();
  if (!cfg) return new NextResponse("Not found", { status: 404 });
  const raw = await req.text();
  if (!validStripeEvent(cfg.webhookSecret, raw, req.headers.get("stripe-signature"))) return new NextResponse("Bad signature", { status: 400 });
  await applyStripeEvent(getDb(), JSON.parse(raw));
  return NextResponse.json({ received: true });
}
