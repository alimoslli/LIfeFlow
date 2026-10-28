import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { getProvider, modelPrices } from "@/server/jarvis/providers";
import { ProviderUnavailableError } from "@/server/jarvis/providers/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().max(8000).default(""),
  module: z.enum(["home", "finances", "wealth", "school", "work", "calendar", "tasks", "notes", "settings"]).nullish(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
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
    await enforceRateLimit(`jarvis:min:${user.id}`, 20, 60);
    await enforceRateLimit(`jarvis:day:${user.id}`, 400, 86_400);
    const locked = await moneyLocked(user);

    let provider;
    try {
      provider = getProvider();
    } catch (e) {
      if (e instanceof ProviderUnavailableError) throw new HttpError(503, e.message);
      throw e;
    }

    const encoder = new TextEncoder();
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
            signal: req.signal,
            prices: modelPrices(),
            moneyLocked: locked,
          });
        } catch (e) {
          console.error("[jarvis] route", e);
          emit({ type: "error", message: e instanceof Error && /not found/i.test(e.message) ? e.message : "Jarvis hit an unexpected error." });
          emit({ type: "done", messageId: null });
        } finally {
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
