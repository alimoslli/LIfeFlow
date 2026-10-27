import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { decideMemorySuggestion } from "@/server/jarvis/memory-decisions";
import { audit } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";

const body = z.object({ decision: z.enum(["keep", "dismiss"]) });

/** The user's Keep / Not now on a memory Jarvis suggested. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`memories:${user.id}`, 60, 60);
    const result = await withUser(user.id, async (s) => {
      try {
        const r = await decideMemorySuggestion(s, id, parsed.data.decision);
        await audit(s, "user", `memory.suggestion.${parsed.data.decision}`, { type: "memory", id });
        return r;
      } catch (e) {
        if (e instanceof ServiceError) throw new HttpError(e.code === "not_found" ? 404 : 409, e.message);
        throw e;
      }
    });
    return NextResponse.json({ status: result.memory.status, replaced: result.replaced?.content ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
