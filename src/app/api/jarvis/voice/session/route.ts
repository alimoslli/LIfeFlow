import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { startVoiceSession } from "@/server/jarvis/voice";
import { inTestingPhase, LIMIT_MONTH_SECONDS, requirePro, TESTING_BUDGET_MESSAGE, TESTING_LIMITS, testingLimitMessage } from "@/server/billing";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/rate-limit";
import { adminFor } from "@/server/auth/admin";
import { withUser } from "@/server/db/with-user";
import { spendSinceMicros } from "@/server/jarvis/metrics";

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
    if (inTestingPhase() && !(await adminFor(getDb(), user.id))) {
      const day = await rateLimit(getDb(), `voice:testing:${user.id}`, TESTING_LIMITS.voiceCallsPerDay, 86_400);
      if (!day.allowed) throw new HttpError(429, testingLimitMessage("voice calls", TESTING_LIMITS.voiceCallsPerDay, day.retryAfterSeconds));
      const month = await rateLimit(getDb(), `voice:testing-month:${user.id}`, TESTING_LIMITS.voiceCallsPerMonth, LIMIT_MONTH_SECONDS);
      if (!month.allowed) throw new HttpError(429, testingLimitMessage("voice calls", TESTING_LIMITS.voiceCallsPerMonth, month.retryAfterSeconds, "month"));
      // The same dollar cap as typed chat (each turn's measured cost).
      const spent = await withUser(user.id, (s) => spendSinceMicros(s, new Date(Date.now() - LIMIT_MONTH_SECONDS * 1000)));
      if (spent >= TESTING_LIMITS.assistantDollarsPerMonth * 1_000_000) throw new HttpError(429, TESTING_BUDGET_MESSAGE);
    }
    try {
      return NextResponse.json(await startVoiceSession(user, parsed.data.module ?? null, undefined, parsed.data.conversationId), {
        headers: { "cache-control": "no-store" },
      });
    } catch (e) {
      console.error("[voice] session", e);
      const status = (e as { status?: number }).status;
      throw new HttpError(503, status === 401 ? "Voice isn't available yet." : "Couldn't start a voice call right now. Try again in a moment.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
