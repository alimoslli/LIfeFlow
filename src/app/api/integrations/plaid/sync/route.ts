import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { PlaidError, syncConnection } from "@/server/integrations/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ id: z.string().uuid() });

/** Syncs one bank connection now. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`plaid-sync:${user.id}`, 20, 600);
    try {
      return NextResponse.json({ ok: true, synced: await syncConnection(user.id, parsed.data.id, user.timezone) });
    } catch (e) {
      if (e instanceof PlaidError) throw new HttpError(502, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
