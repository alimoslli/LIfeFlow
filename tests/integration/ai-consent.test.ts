import { afterAll, describe, expect, it } from "vitest";
import { todayIn } from "@/lib/dates";
import { aiAllowed } from "@/lib/ai-consent";
import { closeDb } from "@/server/db/client";
import { processDocument } from "@/server/services/inbox";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("AI consent (App Store 5.1.2(i))", () => {
  it("is off until the user allows it", () => {
    expect(aiAllowed(undefined)).toBe(false);
    expect(aiAllowed({ aiConsentAt: null })).toBe(false);
    expect(aiAllowed({ aiConsentAt: "2026-11-01T10:00:00.000Z" })).toBe(true);
  });

  it("never sends a forwarded email to the AI without consent; it's kept and says how to turn it on", async () => {
    const { run } = await makeUser("No AI", { ai: false });
    let called = false;
    const extract = async () => {
      called = true;
      throw new Error("should not be called");
    };
    const row = await run((s) =>
      processDocument(s, TZ, todayIn(TZ), { channel: "email", subject: "Comcast bill", text: "Amount due $64.99", files: [] }, extract),
    );
    expect(called).toBe(false);
    expect(row).toMatchObject({ status: "failed", reason: expect.stringMatching(/Allow Jarvis to use AI/) });
  });
});
