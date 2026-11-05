import { describe, expect, it } from "vitest";
import { hourLabel, previewClock, previewDay, PREVIEW_STORY_COUNT, seeded, type PreviewStage } from "@/lib/day-preview";

const STAGES: PreviewStage[] = ["student", "working", "both", "life"];
const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m); // a Wednesday

describe("Your day, connected", () => {
  it("gives three different stories that fit what fills the week, at any time of day", () => {
    for (const stage of STAGES)
      for (let seed = 1; seed <= 150; seed++) {
        const now = at(6 + (seed % 17), (seed * 7) % 60);
        const d = previewDay({ stage, course: "PSY 101", job: "Target", now }, seeded(seed));
        expect(d.stories).toHaveLength(3);
        expect(new Set(d.stories.map((s) => s.id)).size).toBe(3);
        const kinds = d.stories.map((s) => s.kind);
        if (stage === "working" || stage === "life") expect(kinds).not.toContain("school");
        if (stage === "student" || stage === "life") expect(kinds).not.toContain("work");
        if (stage === "both") expect(kinds).toEqual(["school", "money", "work"]);
        for (const s of d.stories) {
          expect(s.chips.length).toBeGreaterThan(0);
          expect(s.chips.every((c) => c.example)).toBe(true); // anything invented is marked
          const text = [s.title, s.why, s.action, s.note, ...s.chips.map((c) => c.label)].join(" ");
          expect(text).not.toMatch(/undefined|NaN|null|—/);
        }
      }
  });

  it("uses their own class and job, and different seeds give different days", () => {
    const one = previewDay({ stage: "both", course: "PSY 101", job: "Target", now: at(10) }, seeded(3));
    const all = one.stories.flatMap((s) => [s.title, s.why, ...s.chips.map((c) => c.label)]).join(" ");
    expect(all).toMatch(/PSY 101/);
    expect(all).toMatch(/Target/);
    const days = new Set(
      Array.from({ length: 20 }, (_, i) =>
        previewDay({ stage: "both", now: at(10) }, seeded(i + 1))
          .stories.map((s) => s.id + s.title)
          .join("|"),
      ),
    );
    expect(days.size).toBeGreaterThan(10);
    expect(PREVIEW_STORY_COUNT).toBe(14);
  });

  it("plans from the real clock: today when there's time, tomorrow when it's late", () => {
    expect(previewClock(at(13, 10), "student")).toMatchObject({ today: true, slot: "2 to 4 PM", freeLabel: "8h 30m free today" });
    expect(previewClock(at(13, 10), "working").freeLabel).toBe("4h 50m free today"); // the 5 PM shift isn't free time
    expect(previewClock(at(21, 30), "student")).toMatchObject({ today: false, slotDay: "tomorrow", slot: "10 AM to 12 PM" });
    expect(hourLabel(16 + 40 / 60)).toBe("4:40 PM");
    expect(previewDay({ stage: "student", now: at(9, 5) }, seeded(1)).today).toBe("Wednesday · 9:05 AM");
  });
});
