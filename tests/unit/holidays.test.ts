import { describe, expect, it } from "vitest";
import { holidaysBetween, isDayOff, usHolidaysOf, usesUsHolidays } from "@/lib/holidays";

describe("public holidays on the sky (owner, 2026-11-18: a test student couldn't tell if it was Thanksgiving week)", () => {
  it("works out the floating days from the calendar", () => {
    const y2026 = Object.fromEntries(usHolidaysOf(2026).map((h) => [h.name, h.date]));
    expect(y2026.Thanksgiving).toBe("2026-11-26");
    expect(y2026["Labor Day"]).toBe("2026-09-07");
    expect(y2026["Memorial Day"]).toBe("2026-05-25");
    expect(y2026["Martin Luther King Jr. Day"]).toBe("2026-01-19");
    expect(Object.fromEntries(usHolidaysOf(2027).map((h) => [h.name, h.date])).Thanksgiving).toBe("2027-11-25");
  });

  it("only for a US time zone, and only in the range asked", () => {
    expect(holidaysBetween("America/Chicago", "2026-11-16", "2026-12-31").map((h) => h.name)).toEqual(["Thanksgiving", "Christmas Day"]);
    expect(holidaysBetween("America/Toronto", "2026-11-16", "2026-12-31")).toEqual([]);
    expect(holidaysBetween("Europe/London", "2026-11-16", "2026-12-31")).toEqual([]);
    expect(usesUsHolidays("America/Indiana/Indianapolis")).toBe(true);
    expect(usesUsHolidays("Pacific/Honolulu")).toBe(true);
  });
});

describe("a day off from a connected calendar (owner, 2026-11-18: Canvas's breaks are added too)", () => {
  it("knows breaks, closures and holidays by their title", () => {
    for (const t of [
      "Thanksgiving Break - No Classes",
      "Spring Break",
      "Fall break",
      "No classes",
      "Campus Closed",
      "University closed for winter recess",
      "Reading Day",
      "Labor Day",
      "MLK Day - no school",
      "Holiday",
      "Labor Day (observed)",
      "Christmas Day",
      "Thanksgiving",
    ])
      expect(isDayOff(t), t).toBe(true);
  });
  it("leaves ordinary events alone", () => {
    for (const t of [
      "BIO 105 Lecture",
      "Office hours",
      "Breakfast with Sam",
      "Lab report due",
      "Breakdance club",
      "Midterm review",
      // QA, 2026-11-18: classes that only mention a holiday or a break
      "Lecture: Holiday Marketing",
      "Christmas Carol seminar",
      "Break-even analysis workshop",
      "Lunch break",
      "Thanksgiving food drive",
      "Holiday party planning",
    ])
      expect(isDayOff(t), t).toBe(false);
  });
});
