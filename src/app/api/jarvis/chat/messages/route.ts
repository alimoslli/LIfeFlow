import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { conversationSnapshot } from "@/server/jarvis/conversation-ui";

export const dynamic = "force-dynamic";

/** The saved messages of one of the user's conversations, so a chat whose connection dropped can show the answer when it lands. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("conversationId"));
    if (!id.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`jarvis:poll:${user.id}`, 120, 60);
    const snap = await withUser(user.id, (s) => conversationSnapshot(s, id.data));
    // A conversation that isn't saved (yet) is not an error: the chat is waiting to see whether its message arrived.
    return Response.json(snap ?? { title: "", messages: [], finished: false, missing: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
