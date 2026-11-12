import { describe, expect, it } from "vitest";
import type { ClockData, ClockItem } from "@/lib/day-clock";
import { weekCounts, weekItems } from "@/app/(onboarding)/welcome/week-step";

const item = (o: Partial<ClockItem>): ClockItem => ({
  id: "x",
  kind: "block",
  cat: "other",
  icon: "",
  title: "t",
  start: 600,
  end: 660,
  allDay: false,
  href: "/",
  source: "",
  subtitle: null,
  ...o,
});
const clock = (items: ClockItem[]) => ({ items }) as ClockData;

describe("week so far", () => {
  it("counts only what is really in the next seven days", () => {
    const items = [
      item({ id: "1", cat: "class" }),
      item({ id: "2", cat: "class", start: 1440 + 600 }),
      item({ id: "3", cat: "work" }),
      item({ id: "4", cat: "due", kind: "due", origin: "assignment", start: 3 * 1440 }),
      item({ id: "past", cat: "class", start: -300 }),
      item({ id: "far", cat: "class", start: 8 * 1440 }),
      item({ id: "someday", cat: "due", someday: true }),
      item({ id: "done", cat: "due", done: true }),
      item({ id: "recap", cat: "other", origin: "day" }),
    ];
    const week = weekItems(clock(items));
    expect(week.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
    expect(weekCounts(week)).toBe("2 classes, 1 shift and 1 due date");
  });

  it("says nothing for an empty week", () => {
    expect(weekItems(clock([]))).toEqual([]);
    expect(weekCounts([])).toBe("");
  });
});
