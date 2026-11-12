import { describe, expect, it } from "vitest";
import { billingConfig, inTestingPhase, monthlyLimitMessage, TESTING_LIMITS, testingLimitMessage } from "@/server/billing";

describe("testing-phase limits", () => {
  it("apply only while paid plans are off", () => {
    expect(inTestingPhase(null)).toBe(true);
    const cfg = billingConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_ID: "price_1", APP_URL: "https://x.test" });
    expect(cfg).not.toBeNull();
    expect(inTestingPhase(cfg)).toBe(false);
  });

  it("keep one person's month inside a few dollars", () => {
    expect(TESTING_LIMITS.assistantDollarsPerMonth).toBeLessThanOrEqual(5);
    expect(TESTING_LIMITS.messagesPerMonth).toBeLessThanOrEqual(TESTING_LIMITS.messagesPerDay * 30);
    // Voice: at most 30 minutes a month, and a day can't use more than a month allows.
    expect(TESTING_LIMITS.voiceCallsPerMonth * TESTING_LIMITS.voiceCallMinutes).toBeLessThanOrEqual(30);
    expect(TESTING_LIMITS.voiceCallsPerDay).toBeLessThanOrEqual(TESTING_LIMITS.voiceCallsPerMonth);
  });

  it("say plainly what's used and when more open up, without naming settings", () => {
    expect(testingLimitMessage("messages", 30, 5 * 3600 + 10)).toBe(
      "You've used today's 30 messages. While LifeFlow is in testing, everyone gets 30 a day. More open up in about 6 hours.",
    );
    expect(testingLimitMessage("voice calls", 10, 4 * 86_400, "month")).toBe(
      "You've used this month's 10 voice calls. While LifeFlow is in testing, everyone gets 10 a month. More open up in about 4 days.",
    );
  });
});

describe("limit messages for a month", () => {
  it("say the date the allowance opens, never a count of days", () => {
    expect(testingLimitMessage("messages", 300, 10 * 86_400, "month", "December 1")).toBe(
      "You've used this month's 300 messages. While LifeFlow is in testing, everyone gets 300 a month. More open up on December 1.",
    );
    expect(monthlyLimitMessage("December 1", true)).toBe(
      "You've reached this month's skyling limit while LifeFlow is in testing. It opens up again on December 1. Everything else in the app keeps working.",
    );
    expect(monthlyLimitMessage("December 1", false)).toMatch(/this month's skyling allowance\. It opens up again on December 1/);
  });
});
