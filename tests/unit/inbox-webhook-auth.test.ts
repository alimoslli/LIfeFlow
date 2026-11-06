import { describe, expect, it } from "vitest";
import { inboxWebhookAuth, sameSecret } from "@/server/services/inbox/webhook-auth";

const SECRET = "s3cret-for-the-inbox-webhook";
const URL_ = "https://lifeflow.test/api/inbox/email";
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const req = (url = URL_, headers: Record<string, string> = {}) => new Request(url, { method: "POST", headers });

describe("inbox webhook secret", () => {
  it("accepts the secret as the basic-auth password (how inbound email services send it), whatever the user name", () => {
    expect(inboxWebhookAuth(req(URL_, { authorization: basic("inbox", SECRET) }), SECRET)).toBe("header");
    expect(inboxWebhookAuth(req(URL_, { authorization: basic("postmark", SECRET) }), SECRET)).toBe("header");
  });

  it("accepts the secret in its own header", () => {
    expect(inboxWebhookAuth(req(URL_, { "x-inbox-secret": SECRET }), SECRET)).toBe("header");
  });

  it("still accepts the old ?key= form, and says so, so the live setup keeps working", () => {
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`), SECRET)).toBe("query");
  });

  it("refuses a wrong, missing or partial secret on every path, and refuses everything when no secret is set", () => {
    expect(inboxWebhookAuth(req(URL_, { authorization: basic("inbox", "wrong") }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(URL_, { authorization: basic(SECRET, "") }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(URL_, { authorization: `Basic ${Buffer.from(SECRET).toString("base64")}` }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(URL_, { "x-inbox-secret": SECRET.slice(0, -1) }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=wrong`), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}x`), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(), SECRET)).toBeNull();
    // Any header means the header path only: a wrong, malformed or non-Basic header isn't rescued by a right key in the URL.
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`, { "x-inbox-secret": "wrong" }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`, { authorization: basic("inbox", "wrong") }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`, { authorization: `Bearer ${SECRET}` }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`, { authorization: "Basic !!!not-base64" }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=${SECRET}`, { authorization: "" }), SECRET)).toBeNull();
    expect(inboxWebhookAuth(req(URL_, { authorization: basic("inbox", "") }), "")).toBeNull();
    expect(inboxWebhookAuth(req(`${URL_}?key=`), "")).toBeNull();
  });

  it("compares in constant time whatever the lengths", () => {
    expect(sameSecret(SECRET, SECRET)).toBe(true);
    expect(sameSecret("short", SECRET)).toBe(false);
    expect(sameSecret(SECRET + "-and-much-longer-than-the-secret", SECRET)).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});
