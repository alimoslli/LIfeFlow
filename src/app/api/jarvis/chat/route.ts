import { paywallActive } from "@/server/plans";
import { after } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { getProvider, modelPrices, smallModelPrices } from "@/server/jarvis/providers";
import { ProviderUnavailableError } from "@/server/jarvis/providers/types";
import { FREE_JARVIS_PER_DAY, isPro } from "@/server/billing";
import { peekAi, subjectFor } from "@/server/services/ai-gate";
import { refusalMessage } from "@/server/services/ai-limits";
import { turnStateOf } from "@/server/jarvis/turn-state";
import { withUser } from "@/server/db/with-user";
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
      throw new HttpError(
        402,
        paywallActive()
          ? `You've used today's ${FREE_JARVIS_PER_DAY} free messages. A plan has a much bigger daily allowance (Settings → Plan).`
          : `You've used today's ${FREE_JARVIS_PER_DAY} free messages. They come back tomorrow.`,
      );
    // Allowances (messages, the monthly amount, the company's ceiling): a friendly "no" before anything is saved. The real check,
    // which sets the cost aside in one step, is inside the turn. A retry of a send that was already received skips this look.
    const resend = parsed.data.clientMessageId ? await withUser(user.id, (s) => turnStateOf(s, parsed.data.clientMessageId!)) : null;
    if (!resend?.conversationId) {
      const subject = await subjectFor(user.id, {
        id: user.id,
        timezone: user.timezone,
        plan: user.plan,
        accountKind: user.accountKind,
        preferences: user.preferences,
      });
      const refused = await peekAi(subject, { feature: "chat", firstStep: true, estimateMicros: 1 });
      if (refused) throw new HttpError(refused.scope === "company" ? 503 : 429, refusalMessage(refused, subject, new Date()));
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
