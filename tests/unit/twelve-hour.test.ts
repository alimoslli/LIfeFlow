import { describe, expect, it } from "vitest";
import { twelveHourRanges } from "@/lib/utils";

describe("class times", () => {
  it("shows 24-hour ranges in 12-hour time and leaves the rest alone", () => {
    expect(twelveHourRanges("Tue/Thu 13:00–14:15")).toBe("Tue/Thu 1:00–2:15 PM");
    expect(twelveHourRanges("Mon/Wed 10:00-11:15")).toBe("Mon/Wed 10:00–11:15 AM");
    expect(twelveHourRanges("Fri 11:30–12:45")).toBe("Fri 11:30 AM–12:45 PM");
    expect(twelveHourRanges("Mon 9:00–10:00 am, Room 210")).toBe("Mon 9:00–10:00 am, Room 210");
    expect(twelveHourRanges("Online, any time")).toBe("Online, any time");
  });
});
