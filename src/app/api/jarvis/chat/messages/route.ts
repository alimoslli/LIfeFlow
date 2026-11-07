import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { snapshotForSend } from "@/server/jarvis/conversation-ui";

export const dynamic = "force-dynamic";

/** Where one send stands and its saved conversation, so a chat whose connection dropped can show the answer when it lands. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("clientMessageId"));
    if (!id.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`jarvis:poll:${user.id}`, 120, 60);
    const snap = await withUser(user.id, (s) => snapshotForSend(s, id.data));
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
