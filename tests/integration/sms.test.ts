import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { normalizePhone, toSmsText, twilioSignature, validTwilioRequest, type SmsConfig } from "@/server/integrations/twilio";
import { answerText } from "@/server/jarvis/sms";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { smsDecision, smsStatus, startPhoneLink, unlinkPhone, userForPhone, verifyPhoneLink } from "@/server/services/sms";
import { createTask, listTasks } from "@/server/services/tasks";
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
    expect([smsDecision("Yes!"), smsDecision("no"), smsDecision("yes please add milk")]).toEqual(["confirm", "cancel", null]);
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

    await unlinkPhone(db, user.id);
    expect((await smsStatus(db, user.id)).phone).toBeNull();
    expect(await answerText(db, "+14045550134", "hi", deps)).toBeNull();
  });
});
