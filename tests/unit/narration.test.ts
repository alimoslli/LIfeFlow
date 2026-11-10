import { describe, expect, it } from "vitest";
import { isNarration } from "@/lib/narration";

describe("words before a tool (LF Marketing's filming, 2026-11-10: a reply rewrote itself)", () => {
  it("clears what only says what's about to happen", () => {
    for (const t of ["Let me check your week…", "One sec:", "Checking your calendar...", "Looking at your bills now:", "let's see"])
      expect(isNarration(t)).toBe(true);
  });
  it("keeps an answer said first", () => {
    for (const t of ["That's a promise. I'll check in tonight at 8.", "Added to your to-dos.", "Got it, Bio 101 on Mondays and Wednesdays."])
      expect(isNarration(t)).toBe(false);
    expect(isNarration("")).toBe(false);
  });
});
