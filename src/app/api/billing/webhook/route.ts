import { NextResponse } from "next/server";
import { applyStripeEvent, billingConfig, validStripeEvent } from "@/server/billing";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Stripe calls this when a subscription starts, changes or ends. Verified by Stripe's signature. */
export async function POST(req: Request) {
  const cfg = billingConfig();
  if (!cfg) return new NextResponse("Not found", { status: 404 });
  const raw = await req.text();
  if (!validStripeEvent(cfg.webhookSecret, raw, req.headers.get("stripe-signature"))) return new NextResponse("Bad signature", { status: 400 });
  try {
    const result = await applyStripeEvent(getDb(), JSON.parse(raw), { cfg });
    // Another request is syncing this customer: ask Stripe to retry (a retry reads live state, so it is harmless).
    if (result === "busy") return new NextResponse("Busy, try again", { status: 503 });
  } catch {
    // Stripe couldn't be read (or the body wasn't usable): nothing changed, so ask Stripe to retry. No ids in the log.
    console.error("[stripe] webhook could not be applied");
    return new NextResponse("Try again", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
