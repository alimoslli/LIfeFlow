import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { exchangePublicToken, PlaidError, syncConnection } from "@/server/integrations/plaid";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ publicToken: z.string().min(10).max(500), institutionName: z.string().max(200).nullish() });

/** Finishes Plaid Link: saves the connection, then runs the first sync. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`plaid-exchange:${user.id}`, 10, 600);
    try {
      const item = await withUser(user.id, async (s) => {
        const row = await exchangePublicToken(s, parsed.data.publicToken, parsed.data.institutionName ?? null);
        await audit(s, "user", "integration.plaid.connected", { type: "integration", id: row.id }, { institution: row.displayName });
        return row;
      });
      // First sync in its own transaction, so a slow bank never loses the saved connection.
      let synced = null;
      let note: string | null = null;
      try {
        synced = await syncConnection(user.id, item.id, user.timezone);
      } catch (e) {
        note = e instanceof PlaidError ? e.message : "Connected. The first sync will finish shortly.";
      }
      return NextResponse.json({ ok: true, name: item.displayName, synced, note });
    } catch (e) {
      if (e instanceof PlaidError) throw new HttpError(502, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
