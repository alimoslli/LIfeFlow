import { describe, expect, it } from "vitest";
import { EARLIEST_SLOT, earliestSlotStart, parseMeetingInfo } from "@/lib/routine";
import { slotMinutes } from "@/server/services/habits";

describe("class times from a course's meeting text", () => {
  it("reads the common formats", () => {
    expect(parseMeetingInfo("Mon/Wed 10:00–11:15")).toEqual([{ days: [1, 3], start: "10:00", end: "11:15" }]);
    expect(parseMeetingInfo("Tue/Thu 13:00-14:15")).toEqual([{ days: [2, 4], start: "13:00", end: "14:15" }]);
    expect(parseMeetingInfo("MWF 9:00-9:50 AM")).toEqual([{ days: [1, 3, 5], start: "09:00", end: "09:50" }]);
    expect(parseMeetingInfo("TTh 11:00–12:15 PM")).toEqual([{ days: [2, 4], start: "11:00", end: "12:15" }]);
    expect(parseMeetingInfo("Mon 9:00–10:00 am, Room 210")).toEqual([{ days: [1], start: "09:00", end: "10:00" }]);
    expect(parseMeetingInfo("Tuesdays and Thursdays 2:30 pm - 3:45 pm")).toEqual([{ days: [2, 4], start: "14:30", end: "15:45" }]);
    expect(parseMeetingInfo("Mon/Wed 10:00–11:15, Fri 9:00–9:50")).toEqual([
      { days: [1, 3], start: "10:00", end: "11:15" },
      { days: [5], start: "09:00", end: "09:50" },
    ]);
  });

  it("knows a class with no fixed time takes none", () => {
    expect(parseMeetingInfo("Online, any time")).toEqual([]);
    expect(parseMeetingInfo("Asynchronous")).toEqual([]);
    expect(parseMeetingInfo("")).toEqual([]);
    expect(parseMeetingInfo(null)).toEqual([]);
  });

  it("gives up (null) instead of guessing", () => {
    for (const text of [
      "see syllabus",
      "TBA",
      "Mon/Wed mornings",
      "1:00-2:15",
      "Mon 1:00-2:15",
      "Mon/Wed 10-11",
      "Room 210, Mon 9:00–10:00",
      "Mon-Wed 9:00-10:00",
      "Mon 9:00–10:00, Wed at 3pm",
    ])
      expect(parseMeetingInfo(text), text).toBeNull();
  });
});

describe("the earliest a suggested slot may start (never take sleep)", () => {
  const bed = (answer: string) => [{ content: `When I usually go to bed on a weeknight: ${answer}.` }];
  it("is 9 AM unless the bedtime answer says later", () => {
    expect(EARLIEST_SLOT).toBe("09:00");
    expect(earliestSlotStart([])).toBe("09:00");
    expect(earliestSlotStart(bed("before 11 pm"))).toBe("09:00");
    expect(earliestSlotStart(bed("11 pm to 1 am"))).toBe("09:00");
    expect(earliestSlotStart(bed("it changes a lot"))).toBe("09:00");
    expect(earliestSlotStart(bed("after 1 am"))).toBe("10:00");
    expect(earliestSlotStart(bed("around 3 am"))).toBe("11:00");
    expect(earliestSlotStart([{ content: "I like mornings." }, ...bed("after 2:30 am")])).toBe("11:30");
  });

  it("offers no morning slot when bedtime is in the daytime (night work)", () => {
    expect(earliestSlotStart(bed("around 9 am"))).toBeNull();
  });
});

describe("which habits a time slot makes sense for", () => {
  const h = (title: string, kind = "custom", cadence = "daily", target: number | null = null) => ({ title, kind, cadence, target });
  it("time-boxed ones: study, workouts, things with a duration", () => {
    expect(slotMinutes(h("Study 25 minutes a day", "study", "daily", 25))).toBe(25);
    expect(slotMinutes(h("Gym"))).toBe(30);
    expect(slotMinutes(h("Go for a run", "custom", "weekly"))).toBe(30);
    expect(slotMinutes(h("Walk 20 minutes"))).toBe(20);
    expect(slotMinutes(h("Read 20 pages"))).toBe(30);
    expect(slotMinutes(h("Practice guitar 1 hour"))).toBe(60);
  });

  it("not for habits you keep all day, money habits, or weekends", () => {
    expect(slotMinutes(h("No soda"))).toBeNull();
    expect(slotMinutes(h("Drink 8 glasses of water"))).toBeNull();
    expect(slotMinutes(h("No phone for 30 minutes before bed"))).toBeNull();
    expect(slotMinutes(h("Save $10 each payday", "save", "payday", 1000))).toBeNull();
    expect(slotMinutes(h("No-spend weekend", "no_spend", "weekends"))).toBeNull();
    expect(slotMinutes(h("Yoga", "custom", "weekends"))).toBeNull();
  });
});
