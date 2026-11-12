import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { enforceRateLimit, HttpError } from "@/server/http";
import { sendSms, smsConfig, validTwilioRequest } from "@/server/integrations/twilio";
import { answerText } from "@/server/jarvis/sms";
import { legalDetails } from "@/lib/legal";
import { claimInboundSms, smsHelpText, smsKeyword, unlinkPhone, userForPhone } from "@/server/services/sms";
import { getProvider, modelPrices, smallModelPrices } from "@/server/jarvis/providers";

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
  // At-most-once on purpose: the id is claimed BEFORE the work, so a provider retry (or a crash mid-turn) never runs a second turn or repeats an action.
  // A retry of a text we already took (same provider message id) is answered with nothing, so a turn never runs twice.
  const sid = params.MessageSid || params.SmsMessageSid;
  if (sid && !(await claimInboundSms(getDb(), sid))) return EMPTY;
  // Carrier keywords come first and never reach the skyling.
  const keyword = smsKeyword(body);
  if (keyword === "stop") {
    // Twilio blocks further texts and sends its own confirmation; we forget the number too.
    after(async () => {
      const userId = await userForPhone(getDb(), from);
      if (userId) await unlinkPhone(getDb(), userId);
    });
    return EMPTY;
  }
  if (keyword) {
    const text =
      keyword === "help"
        ? smsHelpText(legalDetails().email)
        : "LifeFlow: texts are back on. To text your skyling, add this number in the app under Settings, Text your skyling.";
    after(() => sendSms(cfg, from, text).catch((e) => console.error("[sms] keyword reply failed", e instanceof Error ? e.name : e)));
    return EMPTY;
  }
  after(() =>
    answerText(getDb(), from, body, {
      provider: getProvider,
      send: (to, text) => sendSms(cfg, to, text),
      prices: modelPrices(),
      smallPrices: smallModelPrices(),
    }).catch((e) => console.error("[sms] reply failed", e instanceof Error ? e.name : e)),
  );
  return EMPTY;
}
