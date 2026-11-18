import { describe, expect, it } from "vitest";
import { timeRangeIn } from "@/lib/dates";

describe("timeRangeIn", () => {
  it("shows AM and PM on both ends of a night shift, and once when they match", () => {
    expect(timeRangeIn(new Date("2026-11-26T04:00:00Z"), new Date("2026-11-26T12:30:00Z"), "America/Chicago")).toBe("10:00 PM to 6:30 AM");
    expect(timeRangeIn(new Date("2026-11-26T20:00:00Z"), new Date("2026-11-26T23:30:00Z"), "America/Chicago")).toBe("2:00 to 5:30 PM");
  });
});
