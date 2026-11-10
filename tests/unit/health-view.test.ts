import { describe, expect, it } from "vitest";
import { healthView, hoursText } from "@/lib/health-view";

describe("healthView", () => {
  it("words hours as hours and minutes", () => {
    expect(hoursText(7.1667)).toBe("7h 10m");
    expect(hoursText(8)).toBe("8h 0m");
  });
  it("uses only what exists", () => {
    const v = healthView([], "2026-11-10");
    expect(v.sleep).toBeNull();
    expect(v.stepsYesterday).toBeNull();
    expect(v.resting).toBeNull();
    expect(v.week).toHaveLength(7);
    expect(v.week.every((d) => d.hours === null)).toBe(true);
  });
  it("reads last night, steps against the day before, active days and the week", () => {
    const v = healthView(
      [
        {
          metric: "sleep_hours",
          series: [
            { day: "2026-11-09", value: 6 },
            { day: "2026-11-10", value: 7.5 },
          ],
        },
        {
          metric: "steps",
          series: [
            { day: "2026-11-08", value: 6240 },
            { day: "2026-11-09", value: 8120 },
          ],
        },
        {
          metric: "exercise_minutes",
          series: [
            { day: "2026-11-08", value: 30 },
            { day: "2026-11-09", value: 0 },
          ],
        },
        { metric: "resting_heart_rate", series: [{ day: "2026-11-10", value: 62 }] },
      ],
      "2026-11-10",
    );
    expect(v.sleep).toMatchObject({ text: "7h 30m", isToday: true });
    expect(v.stepsYesterday).toBe(8120);
    expect(v.stepsBefore).toEqual({ label: "Sun", value: 6240 });
    expect(v.activeDays).toBe(1);
    expect(v.resting).toBe(62);
    expect(v.week.at(-1)).toMatchObject({ letter: "T", hours: 7.5, isToday: true });
  });
});
