import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { enforceRateLimit, HttpError } from "@/server/http";
import { sendSms, smsConfig, validTwilioRequest } from "@/server/integrations/twilio";
import { answerText } from "@/server/jarvis/sms";
import { getProvider } from "@/server/jarvis/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "content-type": "text/xml" } });

/** Twilio calls this for every text to the LifeFlow number. Signed by Twilio; answered after the response so Twilio never waits. */
export async function POST(req: Request) {
  const cfg = smsConfig();
  if (!cfg) return new Response("Not found", { status: 404 });
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  if (!validTwilioRequest(cfg.authToken, `${cfg.appUrl}/api/sms/inbound`, params, req.headers.get("x-twilio-signature")))
    return new Response("Forbidden", { status: 403 });
  const from = params.From ?? "";
  const body = (params.Body ?? "").trim();
  if (!from || !body) return EMPTY;
  try {
    await enforceRateLimit(`sms:${from}`, 30, 3600);
  } catch (e) {
    if (e instanceof HttpError) return EMPTY;
    throw e;
  }
  after(() =>
    answerText(getDb(), from, body, { provider: getProvider, send: (to, text) => sendSms(cfg, to, text) }).catch((e) =>
      console.error("[sms] reply failed", e instanceof Error ? e.name : e),
    ),
  );
  return EMPTY;
}
