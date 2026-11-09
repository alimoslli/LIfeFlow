import { NextResponse } from "next/server";
import { z } from "zod";
import { withPlaidSyncLock } from "@/server/db/job-lock";
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
      const run = await withPlaidSyncLock(parsed.data.id, () => syncConnection(user.id, parsed.data.id, user.timezone, undefined, { live: true }));
      // Another sync of this bank (webhook or schedule) is running and will bring the data: not a failure.
      if (run.skipped) return NextResponse.json({ ok: true, synced: null, alreadySyncing: true });
      return NextResponse.json({ ok: true, synced: run.value });
    } catch (e) {
      if (e instanceof PlaidError) throw new HttpError(502, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
