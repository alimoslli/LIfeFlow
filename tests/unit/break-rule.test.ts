import { describe, expect, it } from "vitest";
import { breakForLength, regularHoursOf } from "@/server/services/work";

const RULE = [
  { minShiftMinutes: 360, unpaidMinutes: 30 },
  { minShiftMinutes: 540, unpaidMinutes: 60 },
];

describe("unpaid break rule by shift length", () => {
  it("picks the largest matching rule", () => {
    expect(breakForLength(RULE, 240)).toBe(0); // 4 h
    expect(breakForLength(RULE, 359)).toBe(0); // just under 6 h
    expect(breakForLength(RULE, 360)).toBe(30); // 6 h
    expect(breakForLength(RULE, 450)).toBe(30); // 7.5 h
    expect(breakForLength(RULE, 539)).toBe(30);
    expect(breakForLength(RULE, 540)).toBe(60); // 9 h
    expect(breakForLength(RULE, 720)).toBe(60);
  });
  it("is order independent and empty means no break", () => {
    expect(breakForLength([...RULE].reverse(), 600)).toBe(60);
    expect(breakForLength([], 600)).toBe(0);
    expect(breakForLength(null, 600)).toBe(0);
    expect(breakForLength(undefined, 600)).toBe(0);
  });
  it("a rule-only schedule has no regular hours", () => {
    expect(regularHoursOf({ days: [], start: "00:00", end: "00:00", breakRules: RULE })).toBeNull();
    expect(regularHoursOf({ days: [1], start: "09:00", end: "17:00" })).not.toBeNull();
    expect(regularHoursOf(null)).toBeNull();
  });
});
