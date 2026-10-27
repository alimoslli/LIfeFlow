import { describe, expect, it } from "vitest";
import { addUsage, errorKindOf, estimateCostMicros } from "@/server/jarvis/metrics";
import { toUsage } from "@/server/jarvis/providers/openai";

const u = (inputTokens: number, cachedInputTokens: number, outputTokens: number, reasoningTokens = 0) => ({ inputTokens, cachedInputTokens, outputTokens, reasoningTokens });

describe("token usage", () => {
  it("normalizes Responses API usage and tolerates missing fields", () => {
    expect(toUsage({ input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 1000 }, output_tokens_details: { reasoning_tokens: 120 } })).toEqual(u(1200, 1000, 300, 120));
    expect(toUsage({ input_tokens: 10, output_tokens: 2 })).toEqual(u(10, 0, 2));
    expect(toUsage(undefined)).toBeUndefined();
    expect(toUsage(null)).toBeUndefined();
  });

  it("sums usage across steps, ignoring steps without usage", () => {
    let total = addUsage(null, undefined);
    expect(total).toBeNull();
    total = addUsage(total, u(100, 50, 10, 4));
    total = addUsage(total, undefined);
    total = addUsage(total, u(200, 150, 20, 6));
    expect(total).toEqual(u(300, 200, 30, 10));
  });
});

describe("cost estimate", () => {
  const prices = { inputPerMTok: 2, cachedInputPerMTok: 0.5, outputPerMTok: 8 };

  it("is null unless input and output prices are configured", () => {
    expect(estimateCostMicros(u(1000, 0, 100), {})).toBeNull();
    expect(estimateCostMicros(u(1000, 0, 100), { inputPerMTok: 2 })).toBeNull();
    expect(estimateCostMicros(null, prices)).toBeNull();
  });

  it("charges cached input at the cached price and output at the output price", () => {
    // 600 uncached × $2 + 400 cached × $0.50 + 100 output × $8, per 1M tokens → micro-dollars
    expect(estimateCostMicros(u(1000, 400, 100), prices)).toBe(600 * 2 + 400 * 0.5 + 100 * 8);
  });

  it("falls back to the input price for cached tokens", () => {
    expect(estimateCostMicros(u(1000, 400, 0), { inputPerMTok: 2, outputPerMTok: 8 })).toBe(2000);
  });
});

describe("error classification", () => {
  it("maps provider failures to coarse, content-free kinds", () => {
    expect(errorKindOf(Object.assign(new Error("x"), { status: 401 }), false)).toBe("auth");
    expect(errorKindOf(Object.assign(new Error("x"), { status: 429 }), false)).toBe("rate_limited");
    expect(errorKindOf(Object.assign(new Error("x"), { status: 503 }), false)).toBe("provider_5xx");
    expect(errorKindOf(new Error("fetch failed"), false)).toBe("network");
    expect(errorKindOf(new Error("boom"), false)).toBe("internal");
    expect(errorKindOf(new Error("boom"), true)).toBe("cancelled");
  });
});
