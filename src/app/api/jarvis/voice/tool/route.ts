import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { relayVoiceTool } from "@/server/jarvis/voice";

export const dynamic = "force-dynamic";

const body = z.object({
  conversationId: z.string().uuid(),
  callId: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  arguments: z.string().max(100_000),
  userText: z.string().max(8000).optional(),
});

/** Runs a tool the voice model asked for, with the same checks as typed chat. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`voice-tool:${user.id}`, 60, 60);
    try {
      return NextResponse.json(await relayVoiceTool(user, parsed.data));
    } catch (e) {
      if (e instanceof Error && /not found/i.test(e.message)) throw new HttpError(404, "Conversation not found");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
