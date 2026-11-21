import { describe, expect, it } from "vitest";
import { serializeResult, weekdayOf, withWeekdays } from "@/server/jarvis/serialize-result";

// Owner, 2026-11-21 ("the cheap fix"): the model is sent the weekday beside every local date a tool returns, because
// models got weekdays wrong more than anything else on the Jarvis eval. The dates themselves never change.
describe("weekdays beside tool dates", () => {
  it("names the weekday of plain dates and local date-times", () => {
    expect(weekdayOf("2026-11-02")).toBe("Mon");
    expect(weekdayOf("2026-11-04 23:59")).toBe("Wed");
    expect(weekdayOf("2026-11-05T10:00")).toBe("Thu");
    expect(weekdayOf("2026-11-06T09:30:00-05:00")).toBe("Fri");
    expect(weekdayOf("2026-02-28")).toBe("Sat");
  });

  it("leaves alone what isn't a local date: UTC timestamps, impossible dates, times, text", () => {
    expect(weekdayOf("2026-11-05T03:00:00.000Z")).toBeNull();
    expect(weekdayOf("2026-02-31")).toBeNull();
    expect(weekdayOf("10:50")).toBeNull();
    expect(weekdayOf("Due 2026-11-04")).toBeNull();
    expect(weekdayOf("2026-11-04 is the day")).toBeNull();
    expect(weekdayOf("20261104")).toBeNull();
  });

  it("adds <field>Weekday next to each date, in nested objects and arrays, and keeps every original value", () => {
    const data = {
      assignments: [
        { title: "Argument essay draft", due: "2026-11-04 23:59" },
        { title: "Exam 2", due: "2026-11-05 10:00", course: { code: "BIO 110" } },
      ],
      shifts: [{ date: "2026-11-02", start: "16:00", end: "21:00" }],
      createdAt: "2026-11-02T15:00:00.000Z",
      count: 2,
      note: null,
    };
    expect(withWeekdays(data)).toEqual({
      assignments: [
        { title: "Argument essay draft", due: "2026-11-04 23:59", dueWeekday: "Wed" },
        { title: "Exam 2", due: "2026-11-05 10:00", dueWeekday: "Thu", course: { code: "BIO 110" } },
      ],
      shifts: [{ date: "2026-11-02", dateWeekday: "Mon", start: "16:00", end: "21:00" }],
      createdAt: "2026-11-02T15:00:00.000Z",
      count: 2,
      note: null,
    });
  });

  it("never overwrites a weekday field the tool already sent", () => {
    expect(withWeekdays({ date: "2026-11-02", dateWeekday: "Monday" })).toEqual({ date: "2026-11-02", dateWeekday: "Monday" });
  });

  it("is what serializeResult sends, without changing the stored result", () => {
    const r = { ok: true, data: { due: "2026-11-04 23:59" } };
    expect(JSON.parse(serializeResult(r))).toEqual({ ok: true, data: { due: "2026-11-04 23:59", dueWeekday: "Wed" } });
    expect(r).toEqual({ ok: true, data: { due: "2026-11-04 23:59" } });
  });

  it("leaves results without dates exactly as before", () => {
    const r = { ok: true, data: { id: "t1", title: "Pack lunch" } };
    expect(serializeResult(r)).toBe(JSON.stringify(r));
  });
});
