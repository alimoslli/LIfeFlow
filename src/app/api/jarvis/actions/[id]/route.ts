import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { moneyLocked } from "@/server/auth/money-lock";
import { ServiceError } from "@/server/services/errors";
import { decidePendingAction } from "@/server/jarvis/decide";

const body = z.object({ decision: z.enum(["confirm", "cancel"]) });

/** The user's explicit Confirm/Cancel on an action Jarvis proposed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`actions:${user.id}`, 30, 60);

    let outcome;
    try {
      outcome = await decidePendingAction(user, id, parsed.data.decision, await moneyLocked(user));
    } catch (e) {
      if (e instanceof ServiceError) throw new HttpError(e.code === "not_found" ? 404 : e.code === "forbidden" ? 423 : 409, e.message);
      throw e;
    }
    return NextResponse.json(outcome);
  } catch (e) {
    return errorResponse(e);
  }
}
