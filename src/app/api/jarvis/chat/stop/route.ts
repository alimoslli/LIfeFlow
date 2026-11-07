import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { requestStop } from "@/server/jarvis/stop";

export const dynamic = "force-dynamic";

const body = z.object({ clientMessageId: z.string().uuid() });

/** The Stop button: asks the turn started by one send (its own id) to stop before its next step. It can only ever touch the caller's own turn. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`jarvis:stop:${user.id}`, 30, 60);
    await requestStop(user.id, parsed.data.clientMessageId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
