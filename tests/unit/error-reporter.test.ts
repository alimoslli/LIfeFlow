import { describe, expect, it } from "vitest";
import { isNoise } from "@/lib/error-noise";

describe("browser error noise", () => {
  it("skips what says nothing is wrong", () => {
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("")).toBe(true);
    expect(isNoise(undefined)).toBe(true);
    // as the browser reports it ("<name>: <message>"), which is what reaches /api/errors
    expect(isNoise("Error: ResizeObserver loop completed with undelivered notifications.")).toBe(true);
  });

  it("keeps real errors", () => {
    expect(isNoise("Cannot read properties of null (reading 'parentNode')")).toBe(false);
    expect(isNoise("Minified React error #418")).toBe(false);
    expect(isNoise("TypeError: x is not a function")).toBe(false);
    expect(isNoise("ChunkLoadError: Failed to load chunk")).toBe(false);
  });
});
