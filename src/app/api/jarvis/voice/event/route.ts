import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { recordVoiceRun, saveVoiceTranscript } from "@/server/jarvis/voice";

export const dynamic = "force-dynamic";

const n = z.number().int().min(0).max(100_000_000);
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("transcript"), conversationId: z.string().uuid(), role: z.enum(["user", "assistant"]), text: z.string().min(1).max(8000) }),
  z.object({
    kind: z.literal("end"),
    conversationId: z.string().uuid(),
    stats: z.object({
      durationMs: n,
      responses: n,
      toolCalls: n,
      toolErrors: n,
      confirmations: n,
      inputTokens: n.optional(),
      outputTokens: n.optional(),
      cachedInputTokens: n.optional(),
      error: z.string().max(200).optional(),
    }),
  }),
]);

/** Saves spoken lines to the conversation, and records the call's metrics when it ends. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`voice-event:${user.id}`, 240, 60);
    try {
      if (parsed.data.kind === "transcript") await saveVoiceTranscript(user, parsed.data.conversationId, parsed.data.role, parsed.data.text);
      else await recordVoiceRun(user, parsed.data.conversationId, parsed.data.stats);
    } catch (e) {
      if (e instanceof Error && /not found/i.test(e.message)) throw new HttpError(404, "Conversation not found");
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
