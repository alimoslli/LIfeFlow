import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { startVoiceSession } from "@/server/jarvis/voice";
import { requirePro } from "@/server/billing";
import { AiRefusedError } from "@/server/services/ai-gate";

export const dynamic = "force-dynamic";

const body = z.object({
  module: z.enum(["home", "finances", "wealth", "school", "work", "calendar", "tasks", "notes", "settings"]).nullish(),
  /** The chat the call was started from: its transcript continues there. */
  conversationId: z.string().uuid().nullish(),
});

/** Starts a live voice call: returns a short-lived OpenAI client secret (never the API key). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    requirePro(user, "voice");
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    if (!aiAllowed(user.preferences)) throw new HttpError(403, AI_CONSENT_NEEDED);
    await enforceRateLimit(`voice:min:${user.id}`, 4, 60);
    await enforceRateLimit(`voice:day:${user.id}`, 40, 86_400);
    try {
      return NextResponse.json(await startVoiceSession(user, parsed.data.module ?? null, undefined, parsed.data.conversationId), {
        headers: { "cache-control": "no-store" },
      });
    } catch (e) {
      // A limit (calls, minutes, the company's ceiling) is said plainly; anything else is a generic "couldn't start".
      if (e instanceof AiRefusedError) throw new HttpError(e.refusal.scope === "company" ? 503 : 429, e.message);
      console.error("[voice] session", e);
      const status = (e as { status?: number }).status;
      throw new HttpError(503, status === 401 ? "Voice isn't available yet." : "Couldn't start a voice call right now. Try again in a moment.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
