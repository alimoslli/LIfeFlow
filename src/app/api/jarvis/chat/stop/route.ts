import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { requestStop } from "@/server/jarvis/stop";

export const dynamic = "force-dynamic";

const body = z.object({ conversationId: z.string().uuid() });

/** The Stop button: asks the running turn of one of the user's own conversations to stop before its next step. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`jarvis:stop:${user.id}`, 30, 60);
    await requestStop(user.id, parsed.data.conversationId).catch((e) => {
      if (e instanceof ServiceError && e.code === "not_found") throw new HttpError(404, "Conversation not found");
      throw e;
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
