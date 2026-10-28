import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { createLinkToken, PlaidError, plaidConfig, reconnectLinkToken } from "@/server/integrations/plaid";

export const dynamic = "force-dynamic";

const body = z.object({ reconnect: z.string().uuid().optional() });

/** A short-lived Plaid Link token. With `reconnect`, opens Link in update mode for that connection. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (!plaidConfig()) throw new HttpError(503, "Bank connections aren't set up on the server yet.");
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`plaid-link:${user.id}`, 20, 600);
    try {
      const r = parsed.data.reconnect ? await withUser(user.id, (s) => reconnectLinkToken(s, parsed.data.reconnect!)) : await createLinkToken(user.id);
      return NextResponse.json(r);
    } catch (e) {
      if (e instanceof PlaidError) throw new HttpError(502, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
