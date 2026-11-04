import { describe, expect, it } from "vitest";
import { sendSms, smsConfig } from "@/server/integrations/twilio";

describe("Twilio sender", () => {
  const env = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_PHONE_NUMBER: "+14045550100", APP_URL: "https://lifeflowweb.com" };
  const capture = () => {
    const sent: URLSearchParams[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      sent.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    }) as unknown as typeof fetch;
    return { sent, fetchImpl };
  };

  it("texts from the phone number and answers WhatsApp from the WhatsApp sender", async () => {
    const cfg = smsConfig({ ...env, TWILIO_WHATSAPP_NUMBER: "whatsapp:+14045550199" })!;
    const c = capture();
    await sendSms(cfg, "+14045550134", "hi", c.fetchImpl);
    await sendSms(cfg, "whatsapp:+14045550134", "hi", c.fetchImpl);
    expect(c.sent.map((p) => [p.get("From"), p.get("To")])).toEqual([
      ["+14045550100", "+14045550134"],
      ["whatsapp:+14045550199", "whatsapp:+14045550134"],
    ]);
  });

  it("uses the phone number for WhatsApp when no separate sender is set", async () => {
    const c = capture();
    await sendSms(smsConfig(env)!, "whatsapp:+14045550134", "hi", c.fetchImpl);
    expect(c.sent[0].get("From")).toBe("whatsapp:+14045550100");
  });
});
