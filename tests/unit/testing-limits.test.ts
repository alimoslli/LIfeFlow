import { describe, expect, it } from "vitest";
import { billingConfig, inTestingPhase, TESTING_LIMITS, testingLimitMessage } from "@/server/billing";

describe("testing-phase limits", () => {
  it("apply only while paid plans are off", () => {
    expect(inTestingPhase(null)).toBe(true);
    const cfg = billingConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_ID: "price_1", APP_URL: "https://x.test" });
    expect(cfg).not.toBeNull();
    expect(inTestingPhase(cfg)).toBe(false);
  });

  it("keep a day's AI use small and predictable", () => {
    expect(TESTING_LIMITS.messagesPerDay).toBe(50);
    expect(TESTING_LIMITS.voiceCallsPerDay * TESTING_LIMITS.voiceCallMinutes).toBeLessThanOrEqual(20);
  });

  it("say plainly what's used and when more open up, without naming settings", () => {
    expect(testingLimitMessage("messages", 50, 5 * 3600 + 10)).toBe(
      "You've used today's 50 messages. While LifeFlow is in testing, everyone gets 50 a day. More open up in about 6 hours.",
    );
    expect(testingLimitMessage("voice calls", 4, 60)).toMatch(/about 1 hour\.$/);
  });
});
