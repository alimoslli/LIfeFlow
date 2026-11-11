import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { normalizePhone, toSmsText, twilioSignature, validTwilioRequest, type SmsConfig } from "@/server/integrations/twilio";
import { answerText } from "@/server/jarvis/sms";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import {
  claimInboundSms,
  smsDecision,
  smsHelpText,
  smsKeyword,
  smsStatus,
  startPhoneLink,
  unlinkPhone,
  userForPhone,
  verifyPhoneLink,
} from "@/server/services/sms";
import { createTask, listTasks } from "@/server/services/tasks";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { makeUser } from "../helpers";

afterAll(closeDb);
const CFG: SmsConfig = { accountSid: "AC123", authToken: "secret", from: "+15550001111", appUrl: "https://lifeflow.test" };

/** A fake Twilio that records texts and answers with a message id. */
function twilio() {
  const sent: { to: string; body: string }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const p = new URLSearchParams(String(init.body));
    sent.push({ to: p.get("To")!, body: p.get("Body")! });
    return new Response(JSON.stringify({ sid: `SM${sent.length}` }), { status: 201 });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

describe("SMS helpers", () => {
  it("checks Twilio's signature and reads phones and replies", () => {
    const params = { From: "+14045550134", Body: "hi" };
    const sig = twilioSignature("secret", "https://lifeflow.test/api/sms/inbound", params);
    expect(validTwilioRequest("secret", "https://lifeflow.test/api/sms/inbound", params, sig)).toBe(true);
    expect(validTwilioRequest("secret", "https://lifeflow.test/api/sms/inbound", { ...params, Body: "hacked" }, sig)).toBe(false);
    expect(validTwilioRequest("secret", "https://lifeflow.test/api/sms/inbound", params, null)).toBe(false);
    expect(normalizePhone("(404) 555-0134")).toBe("+14045550134");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("555")).toBeNull();
    expect(toSmsText("**Done.** See [your plan](https://lifeflow.test/plan).")).toBe("Done. See your plan (https://lifeflow.test/plan).");
    expect(toSmsText("x".repeat(2000)).length).toBeLessThanOrEqual(1500);
    expect([smsDecision("Yes!"), smsDecision("no"), smsDecision("yes please add milk"), smsDecision("cancel")]).toEqual(["confirm", "cancel", null, null]);
    expect(["STOP", "Cancel", "unsubscribe.", "start", "HELP", "help me plan"].map(smsKeyword)).toEqual(["stop", "stop", "stop", "start", "help", null]);
    expect(smsHelpText("hi@lifeflow.app")).toMatch(/^LifeFlow: .*Help: hi@lifeflow.app\. Msg & data rates may apply\. Reply STOP to opt out\.$/);
  });
});

describe("texting Jarvis", () => {
  it("links a phone with a code, then answers texts from it only", async () => {
    const db = getDb();
    const { user, run } = await makeUser("Sam");
    const t = twilio();
    await startPhoneLink(db, user.id, "(404) 555-0134", CFG, t.fetchImpl);
    const code = t.sent[0].body.match(/\d{6}/)![0];
    await expect(verifyPhoneLink(db, user.id, code === "000000" ? "111111" : "000000")).rejects.toThrow(/doesn't match/);
    expect(await verifyPhoneLink(db, user.id, code)).toBe("+14045550134");
    expect(await userForPhone(db, "404-555-0134")).toBe(user.id);
    const other = await makeUser("Other");
    await expect(startPhoneLink(db, other.user.id, "4045550134", CFG, t.fetchImpl)).rejects.toThrow(/another account/);

    const send = async (to: string, text: string) => t.sent.push({ to, body: text });
    const deps = { provider: () => new ScriptedProvider(), send };
    expect(await answerText(db, "+19999999999", "hi", deps)).toBeNull(); // unknown numbers get nothing

    await answerText(db, "+14045550134", '/tool create_tasks {"tasks":[{"title":"Buy milk"}]}', deps);
    expect((await run((s) => listTasks(s, { status: "open" }))).map((x) => x.title)).toContain("Buy milk");

    // Something destructive waits for YES by text.
    const task = await run((s) => createTask(s, user.timezone, { title: "Old chore" }));
    const ask = await answerText(db, "+14045550134", `/tool delete_task {"id":"${task.id}"}`, deps);
    expect(ask).toMatch(/Reply YES to confirm or NO to cancel/);
    expect((await run((s) => listTasks(s, { status: "open" }))).map((x) => x.title)).toContain("Old chore");
    const done = await answerText(db, "+14045550134", "yes", deps);
    expect(done).toMatch(/^Confirmed and done/);
    expect((await run((s) => listTasks(s, { status: "open" }))).map((x) => x.title)).not.toContain("Old chore");
    expect(t.sent.at(-1)).toEqual({ to: "+14045550134", body: done });

    // The same number on WhatsApp is the same user, and the reply goes back over WhatsApp.
    await answerText(db, "whatsapp:+14045550134", '/tool create_tasks {"tasks":[{"title":"Call mom"}]}', deps);
    expect((await run((s) => listTasks(s, { status: "open" }))).map((x) => x.title)).toContain("Call mom");
    expect(t.sent.at(-1)?.to).toBe("whatsapp:+14045550134");

    await unlinkPhone(db, user.id);
    expect((await smsStatus(db, user.id)).phone).toBeNull();
    expect(await answerText(db, "+14045550134", "hi", deps)).toBeNull();
  });

  it("when the skyling can't answer, says so plainly and logs the failure without the text", async () => {
    const db = getDb();
    const { user } = await makeUser("Kai");
    const t = twilio();
    await startPhoneLink(db, user.id, "(404) 555-0177", CFG, t.fetchImpl);
    await verifyPhoneLink(db, user.id, t.sent[0].body.match(/\d{6}/)![0]);
    const secret = "my rent is 1450 and my bank pin is 9921";
    const provider = () => {
      // Errors can quote what was sent (a failed query lists its params); none of it may reach the log.
      throw Object.assign(new Error(`Failed query: insert into messages params: ${secret}`), { status: 503 });
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await answerText(db, "+14045550177", secret, { provider, send: async () => {} });
    expect(out).toBe("I can't answer texts right now. Try again in a bit, or open LifeFlow.");
    expect(log).toHaveBeenCalledWith("[sms] reply failed:", "Error", 503);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/1450|9921|rent|Failed query/);
    log.mockRestore();
  });
});

describe("texting an email to send", () => {
  it("a short body can be confirmed by text; one that doesn't fit in the text can't", async () => {
    const db = getDb();
    const { user } = await makeUser("Mo");
    const t = twilio();
    await startPhoneLink(db, user.id, "(404) 555-0188", CFG, t.fetchImpl);
    await verifyPhoneLink(db, user.id, t.sent[0].body.match(/\d{6}/)![0]);
    const deps = { provider: () => new ScriptedProvider(), send: async () => {} };
    const ask = (body: string) => answerText(db, "+14045550188", `/tool send_email ${JSON.stringify({ to: "prof@uni.edu", subject: "Hi", body })}`, deps);
    expect(await ask("Could I get an extension?")).toMatch(/Could I get an extension\?[\s\S]*Reply YES/);
    const long = await ask(`${"Long paragraph. ".repeat(120)}P.S. also send the codes.`);
    expect(long).not.toMatch(/Reply YES/);
    expect(long).toMatch(/Open LifeFlow to review and send/);
  });

  it("a later tool call can't wipe the confirmation and leave YES armed", async () => {
    const db = getDb();
    const { user } = await makeUser("Ro");
    const t = twilio();
    await startPhoneLink(db, user.id, "(404) 555-0199", CFG, t.fetchImpl);
    await verifyPhoneLink(db, user.id, t.sent[0].body.match(/\d{6}/)![0]);
    const provider = () =>
      new ScriptedProvider(({ step }) =>
        step === 0
          ? { toolCalls: [{ name: "send_email", args: { to: "prof@uni.edu", subject: "Hi", body: "Please send my grades." } }] }
          : step === 1
            ? { toolCalls: [{ name: "create_tasks", args: { tasks: [{ title: "Water plants" }] } }] }
            : { text: "Want me to keep an eye on her emails?" },
      );
    const out = await answerText(db, "+14045550199", "email the professor", { provider, send: async () => {} });
    expect(out).not.toMatch(/Reply YES/);
    expect(out).toMatch(/Open LifeFlow to review and confirm/);
    const yes = await answerText(db, "+14045550199", "yes", { provider, send: async () => {} });
    expect(yes).not.toMatch(/^Confirmed and done/);
  });
});

describe("who may text", () => {
  it("a suspended or age-locked account's texts get no answer and never reach the model", async () => {
    const db = getDb();
    const { user } = await makeUser("Sus");
    const t = twilio();
    await startPhoneLink(db, user.id, "(404) 555-0166", CFG, t.fetchImpl);
    await verifyPhoneLink(db, user.id, t.sent[0].body.match(/\d{6}/)![0]);
    const sent: string[] = [];
    let modelCalls = 0;
    const deps = {
      provider: () => {
        modelCalls++;
        return new ScriptedProvider();
      },
      send: async (_to: string, text: string) => void sent.push(text),
    };
    await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, user.id));
    expect(await answerText(db, "+14045550166", "hello", deps)).toBeNull();
    await db
      .update(users)
      .set({ suspendedAt: null, preferences: { ...user.preferences, aiConsentAt: "2026-01-01T00:00:00.000Z", ageBlockedAt: "2026-11-10" } })
      .where(eq(users.id, user.id));
    expect(await answerText(db, "+14045550166", "hello", deps)).toBeNull();
    expect(modelCalls).toBe(0);
    expect(sent).toEqual([]);
  });

  it("claims a provider message id once, even when two deliveries arrive together", async () => {
    const db = getDb();
    const sid = `SM${randomUUID()}`;
    const results = await Promise.all([claimInboundSms(db, sid), claimInboundSms(db, sid), claimInboundSms(db, sid)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimInboundSms(db, sid)).toBe(false);
    expect(await claimInboundSms(db, `SM${randomUUID()}`)).toBe(true);
  });
});
