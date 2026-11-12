import { after } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { getProvider, modelPrices, smallModelPrices } from "@/server/jarvis/providers";
import { ProviderUnavailableError } from "@/server/jarvis/providers/types";
import { FREE_JARVIS_PER_DAY, inTestingPhase, isPro, LIMIT_MONTH_SECONDS, TESTING_BUDGET_MESSAGE, TESTING_LIMITS, testingLimitMessage } from "@/server/billing";
import { withUser } from "@/server/db/with-user";
import { adminFor } from "@/server/auth/admin";
import { spendSinceMicros } from "@/server/jarvis/metrics";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/rate-limit";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { assistantProfile, nameAtStart } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().max(8000).default(""),
  module: z.enum(["home", "finances", "wealth", "school", "work", "calendar", "tasks", "notes", "settings"]).nullish(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
  /** The id the app made for this send. The same id arriving again (a retry) never starts a second turn. */
  clientMessageId: z.string().uuid().nullish(),
});

/** Streams a Jarvis turn as newline-delimited JSON events. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    if (!parsed.data.message.trim() && !parsed.data.attachmentIds.length) throw new HttpError(400, "Message is empty");
    if (!aiAllowed(user.preferences)) throw new HttpError(403, AI_CONSENT_NEEDED);
    await enforceRateLimit(`jarvis:min:${user.id}`, 20, 60);
    await enforceRateLimit(`jarvis:day:${user.id}`, 400, 86_400);
    if (!isPro(user) && !(await rateLimit(getDb(), `jarvis:free:${user.id}`, FREE_JARVIS_PER_DAY, 86_400)).allowed)
      throw new HttpError(402, `You've used today's ${FREE_JARVIS_PER_DAY} free messages. LifeFlow Pro has a much higher daily limit (Settings → Plan).`);
    if (inTestingPhase() && !(await adminFor(getDb(), user.id))) {
      const day = await rateLimit(getDb(), `jarvis:testing:${user.id}`, TESTING_LIMITS.messagesPerDay, 86_400);
      if (!day.allowed) throw new HttpError(429, testingLimitMessage("messages", TESTING_LIMITS.messagesPerDay, day.retryAfterSeconds));
      const month = await rateLimit(getDb(), `jarvis:testing-month:${user.id}`, TESTING_LIMITS.messagesPerMonth, LIMIT_MONTH_SECONDS);
      if (!month.allowed) throw new HttpError(429, testingLimitMessage("messages", TESTING_LIMITS.messagesPerMonth, month.retryAfterSeconds, "month"));
      // The dollar cap uses each turn's measured cost (only when model prices are configured).
      const spent = await withUser(user.id, (s) => spendSinceMicros(s, new Date(Date.now() - LIMIT_MONTH_SECONDS * 1000)));
      if (spent >= TESTING_LIMITS.assistantDollarsPerMonth * 1_000_000) throw new HttpError(429, TESTING_BUDGET_MESSAGE);
    }
    const locked = await moneyLocked(user);

    let provider;
    try {
      provider = getProvider();
    } catch (e) {
      if (e instanceof ProviderUnavailableError) {
        console.error("[jarvis] provider unavailable:", e.message);
        throw new HttpError(503, `${nameAtStart(assistantProfile(user.preferences, user.timezone).name)} isn't available right now. Try again in a minute.`);
      }
      throw e;
    }

    const encoder = new TextEncoder();
    // The platform keeps this function alive until the turn is saved, even after the phone drops the connection
    // (screen locked, app switched, weak signal). after() waits on the turn, up to maxDuration.
    let turnSettled: () => void = () => {};
    const turnDone = new Promise<void>((resolve) => (turnSettled = resolve));
    after(() => turnDone);
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (e: JarvisEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          } catch {
            /* client went away; keep processing so results are persisted */
          }
        };
        try {
          await runJarvisTurn({
            user,
            provider,
            emit,
            conversationId: parsed.data.conversationId,
            text: parsed.data.message,
            module: parsed.data.module,
            attachmentIds: parsed.data.attachmentIds,
            clientMessageId: parsed.data.clientMessageId,
            // Deliberately no req.signal: a dropped connection must not cancel the turn (Stop is its own request).
            prices: modelPrices(),
            smallPrices: smallModelPrices(),
            moneyLocked: locked,
          });
        } catch (e) {
          console.error("[jarvis] route", e);
          emit({ type: "error", message: e instanceof Error && /not found/i.test(e.message) ? e.message : "Something went wrong. Try again." });
          emit({ type: "done", messageId: null });
        } finally {
          turnSettled();
          try {
            controller.close();
          } catch {}
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}
