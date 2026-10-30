import { createHmac, timingSafeEqual } from "node:crypto";

/** Texting Jarvis over SMS (Twilio). Not configured ⇒ the feature is hidden. */
export type SmsConfig = { accountSid: string; authToken: string; from: string; appUrl: string };

export function smsConfig(env: Record<string, string | undefined> = process.env): SmsConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_PHONE_NUMBER?.trim();
  const appUrl = env.APP_URL?.trim().replace(/\/$/, "");
  return accountSid && authToken && from && appUrl ? { accountSid, authToken, from, appUrl } : null;
}

export class SmsError extends Error {}

/** Sends a text. Returns Twilio's message id; anything else is an error (never report a text as sent without it). */
export async function sendSms(cfg: SmsConfig, to: string, body: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: cfg.from, Body: body }).toString(),
  }).catch(() => null);
  const json = res ? ((await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string }) : {};
  if (!res?.ok || !json.sid) {
    console.error("[twilio] send failed", res?.status, json.code, json.message);
    throw new SmsError("The text couldn't be sent.");
  }
  return json.sid;
}

/** Twilio's request signature: HMAC-SHA1 over the full URL plus the sorted POST params, base64. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", authToken).update(data).digest("base64");
}

export function validTwilioRequest(authToken: string, url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** US numbers can be typed as 10 digits; everything else needs the +country code. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

/** Plain text for a phone: markdown links become "title (url)", formatting marks go, long replies are cut with a pointer to the app. */
export function toSmsText(markdown: string, max = 1500) {
  const text = markdown
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/[*_`#>]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 40).trimEnd()}… (open LifeFlow for the rest)`;
}
