import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/server/db/client";
import { POST } from "@/app/api/inbox/email/route";

afterAll(closeDb);

const SECRET = "inbox-route-secret-123";
let saved: string | undefined;
beforeAll(() => {
  saved = process.env.INBOX_WEBHOOK_SECRET;
  process.env.INBOX_WEBHOOK_SECRET = SECRET;
});
afterAll(() => {
  if (saved === undefined) delete process.env.INBOX_WEBHOOK_SECRET;
  else process.env.INBOX_WEBHOOK_SECRET = saved;
});

// Addressed to nobody, so an accepted request is answered { ok: true } and dropped.
const mail = JSON.stringify({ OriginalRecipient: "u-nobodyhere00@in.example.com", FromFull: { Email: "a@b.com" }, Subject: "Hi", TextBody: "Hi" });
const post = (query = "", headers: Record<string, string> = {}) =>
  POST(
    new Request(`https://lifeflow.test/api/inbox/email${query}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: mail }),
  );
const basic = (pass: string) => `Basic ${Buffer.from(`inbox:${pass}`).toString("base64")}`;

describe("inbound email webhook", () => {
  it("accepts the secret in basic auth or its own header, with no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect((await post("", { authorization: basic(SECRET) })).status).toBe(200);
      expect((await post("", { "x-inbox-secret": SECRET })).status).toBe(200);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("still accepts ?key= for now, with a one-line deprecation warning that never includes the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const res = await post(`?key=${SECRET}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(warn).toHaveBeenCalledTimes(1);
      const line = warn.mock.calls[0].join(" ");
      expect(line).toMatch(/deprecated/i);
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain("\n");
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses a wrong key on every path", async () => {
    expect((await post("", { authorization: basic("nope") })).status).toBe(401);
    expect((await post("", { "x-inbox-secret": "nope" })).status).toBe(401);
    expect((await post("?key=nope")).status).toBe(401);
    expect((await post()).status).toBe(401);
  });
});
