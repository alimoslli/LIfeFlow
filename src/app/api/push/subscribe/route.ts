import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { pushConfig, removeSubscription, saveSubscription, subscriptionSchema } from "@/server/services/push";

export const dynamic = "force-dynamic";

/** The public VAPID key the browser needs to subscribe. */
export async function GET() {
  const cfg = pushConfig();
  return NextResponse.json({ available: !!cfg, publicKey: cfg?.publicKey ?? null });
}

/** Saves this device's push subscription. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (!pushConfig()) throw new HttpError(503, "Notifications aren't set up on the server yet.");
    await enforceRateLimit(`push-sub:${user.id}`, 20, 3600);
    const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid subscription");
    try {
      await withUser(user.id, async (s) => {
        await saveSubscription(s, parsed.data);
        await audit(s, "user", "notifications.device_added");
      });
    } catch (e) {
      // Row-level security refused it: this browser's subscription still belongs to another account. The client re-subscribes.
      const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      if (code === "42501") throw new HttpError(409, "This browser is linked to another LifeFlow account.");
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Removes this device (turning notifications off here). */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await withUser(user.id, (s) => removeSubscription(s, parsed.data.endpoint));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
