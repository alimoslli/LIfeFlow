import { describe, expect, it } from "vitest";
import { computeLifeLoad, levelFor } from "@/lib/life-load";

const TODAY = "2026-11-02"; // a Monday

describe("life load", () => {
  it("puts exam prep on the days before it, so a night with nothing due still has work", () => {
    const w = computeLifeLoad({ today: TODAY, committed: [], tasks: [], deadlines: [{ date: "2026-11-05", title: "Midterm", kind: "exam", course: "BIO" }] });
    // Thursday exam: 4h of prep spread over Sun–Wed; Sunday is past, so its share rolls onto today.
    expect(w.days.map((d) => d.parts.schoolwork)).toEqual([1.6, 1, 1.4, 0, 0, 0, 0]);
    expect(w.days[0].reasons).toEqual(["BIO Midterm prep (1.6h)"]);
    expect(w.days[3].hours).toBe(0); // nothing piles onto exam day itself
  });

  it("adds shifts, classes and to-dos, and flags an overloaded day with a lighter one before it", () => {
    const w = computeLifeLoad({
      today: TODAY,
      committed: [
        { date: "2026-11-04", minutes: 9 * 60, label: "Work 10 AM–7 PM" },
        { date: "2026-11-04", minutes: 90, label: "PSY 101" },
      ],
      tasks: [{ date: "2026-11-04", title: "Pay phone bill", priority: "high" }],
      deadlines: [{ date: "2026-11-05", title: "Essay", kind: "assignment" }],
    });
    const wed = w.days[2];
    expect(wed.hours).toBe(12.4); // 9 + 1.5 + 1 + 0.9 essay share
    expect(wed.level).toBe("overloaded");
    expect(wed.reasons[0]).toBe("Work 10 AM–7 PM (9h)");
    expect(w.heaviest.date).toBe("2026-11-04");
    expect(w.lighterBefore?.date).toBe("2026-11-02");
    expect(w.summary).toMatch(/^Wednesday is your heaviest day \(12\.4h, 2\.4h more than fits\)\. Today is lighter/);
  });

  it("puts overdue work on today and ignores prep that falls past this week", () => {
    const w = computeLifeLoad({
      today: TODAY,
      committed: [],
      tasks: [{ date: "2026-10-30", title: "Old chore", priority: "low" }],
      deadlines: [
        { date: "2026-10-31", title: "Lab 3", kind: "lab" },
        { date: "2026-11-20", title: "Final", kind: "exam" },
      ],
    });
    expect(w.days[0].parts).toEqual({ committed: 0, schoolwork: 1.5, todos: 0.5 });
    expect(w.totalHours).toBe(2);
    expect(w.summary).toBe("A light week. A good time to get ahead on something big.");
  });

  it("shows bills on their day and says when checking can't cover them", () => {
    const w = computeLifeLoad({
      today: TODAY,
      committed: [],
      tasks: [],
      deadlines: [],
      liquidCents: 75_000,
      bills: [
        { date: "2026-11-03", name: "Phone", amountCents: 6_000 },
        { date: "2026-11-05", name: "Rent", amountCents: 72_500 },
      ],
    });
    expect(w.days[1].money).toEqual([{ name: "Phone", amountCents: 6_000, short: false }]);
    expect(w.days[3].money).toEqual([{ name: "Rent", amountCents: 72_500, short: true }]);
    expect(w.days[3].hours).toBe(0); // money is shown, never counted as hours
  });

  it("says the week gets lighter when today is the heaviest day", () => {
    const w = computeLifeLoad({ today: TODAY, committed: [{ date: TODAY, minutes: 8 * 60, label: "Work" }], tasks: [], deadlines: [] });
    expect(w.summary).toBe("Today is your heaviest day (8h). It gets lighter after today.");
    expect(w.days.map((d) => d.short)).toEqual(["Today", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("names levels plainly", () => {
    expect([levelFor(2), levelFor(5), levelFor(8), levelFor(11)]).toEqual(["light", "steady", "heavy", "overloaded"]);
  });
});
