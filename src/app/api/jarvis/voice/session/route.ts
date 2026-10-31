import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { startVoiceSession } from "@/server/jarvis/voice";
import { requirePro } from "@/server/billing";

export const dynamic = "force-dynamic";

const body = z.object({ module: z.enum(["home", "finances", "wealth", "school", "work", "calendar", "tasks", "notes", "settings"]).nullish() });

/** Starts a live voice call: returns a short-lived OpenAI client secret (never the API key). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    requirePro(user, "voice");
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`voice:min:${user.id}`, 4, 60);
    await enforceRateLimit(`voice:day:${user.id}`, 40, 86_400);
    try {
      return NextResponse.json(await startVoiceSession(user, parsed.data.module ?? null), { headers: { "cache-control": "no-store" } });
    } catch (e) {
      console.error("[voice] session", e);
      const status = (e as { status?: number }).status;
      throw new HttpError(
        503,
        status === 401 ? "Voice isn't available: the server's OpenAI key was rejected." : "Couldn't start a voice call right now. Try again in a moment.",
      );
    }
  } catch (e) {
    return errorResponse(e);
  }
}
