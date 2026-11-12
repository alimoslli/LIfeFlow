import { describe, expect, it } from "vitest";
import { CLOUDS, pickClouds, type CloudFacts } from "@/lib/idea-clouds";
import { getTool } from "@/server/jarvis/registry";

const none: CloudFacts = {
  student: false,
  worker: false,
  dueSoon: false,
  project: false,
  shifts: false,
  classToday: false,
  bank: false,
  moneyLocked: false,
  health: false,
  used: {},
  ageDays: 30,
};
const busy: CloudFacts = { ...none, student: true, worker: true, dueSoon: true, project: true, shifts: true, classToday: true, bank: true, health: true };

describe("idea clouds (owner, 2026-11-10)", () => {
  it("every cloud maps to tools that exist today", () => {
    for (const c of CLOUDS) for (const t of c.tools) expect(getTool(t), `${c.key}: ${t}`).toBeTruthy();
  });

  it("are short (about 6 words), in our voice, and never guilt or pressure", () => {
    const f = { ...busy, nextAssignment: "Argument essay" };
    for (const c of CLOUDS) {
      const say = c.say("Goldie", f);
      expect(say.split(/\s+/).length, say).toBeLessThanOrEqual(8);
      expect(say, say).not.toMatch(/did you know|you missed|slipping|should have|behind|assistant/i);
      expect(c.ask(f).length).toBeGreaterThan(0);
    }
  });

  it("use the skyling's real name", () => {
    const shown = pickClouds(busy, "Star", 1, 14);
    expect(shown.some((c) => c.say.includes("Star"))).toBe(true);
    expect(shown.every((c) => !c.say.includes("undefined"))).toBe(true);
  });

  it("come from real data only: nothing about classes, shifts, money or sleep without them", () => {
    const keys = pickClouds(none, "Ray", 2, 14).map((c) => c.key);
    expect(keys.sort()).toEqual(["first_today", "free_time", "goal"]);
  });

  it("never show money while the Money lock is on", () => {
    for (let day = 0; day < 9; day++) {
      const keys = pickClouds({ ...busy, moneyLocked: true }, "Ray", day, 14).map((c) => c.key);
      expect(keys).not.toContain("afford");
      expect(keys).not.toContain("bills_week");
      expect(keys).not.toContain("subscriptions");
    }
  });

  it("show what they haven't tried first; a used one only fills a gap, one day in three", () => {
    const used = { promise: true, goal: true, free_time: true, first_today: true } as const;
    const f = { ...none, student: true, used };
    // unused (syllabus) first, then nothing used on most days
    expect(pickClouds(f, "Ray", 1, 3).map((c) => c.key)).toEqual(["syllabus"]);
    expect(pickClouds(f, "Ray", 2, 3).map((c) => c.key)).toEqual(["syllabus"]);
    // every third day a used one may come back to fill the gap
    const third = pickClouds(f, "Ray", 3, 3).map((c) => c.key);
    expect(third[0]).toBe("syllabus");
    expect(third).toHaveLength(3);
  });

  it("over the first week, every major feature gets its turn", () => {
    const f = { ...busy, ageDays: 0 };
    const seen = new Set<string>();
    for (let day = 0; day < 7; day++) for (const c of pickClouds({ ...f, ageDays: day }, "Ray", 20_000 + day, 3)) seen.add(c.key);
    const majors = CLOUDS.filter((c) => c.major).map((c) => c.key);
    // three a day for a week: at least the majors' worth of different ones, majors before the rest
    expect(majors.filter((k) => seen.has(k)).length).toBeGreaterThanOrEqual(Math.min(majors.length, 7));
    for (let day = 0; day < 7; day++) {
      const first = pickClouds({ ...f, ageDays: day }, "Ray", 20_000 + day, 3);
      for (const c of first) expect(CLOUDS.find((x) => x.key === c.key)?.major, `${day}: ${c.key}`).toBe(true);
    }
  });

  it("stay the same within a day and change from day to day", () => {
    expect(pickClouds(busy, "Ray", 100, 3)).toEqual(pickClouds(busy, "Ray", 100, 3));
    const days = new Set(
      Array.from({ length: 5 }, (_, i) =>
        pickClouds(busy, "Ray", 100 + i, 3)
          .map((c) => c.key)
          .join(),
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });

  it("'I finished …' only with a real, short assignment title", () => {
    expect(pickClouds(busy, "Ray", 1, 20).some((c) => c.key === "finished")).toBe(false);
    const withTitle = pickClouds({ ...busy, nextAssignment: "Lab 4" }, "Ray", 1, 20).find((c) => c.key === "finished");
    expect(withTitle).toEqual({
      key: "finished",
      say: "Tell Ray I finished Lab 4",
      why: "It ticks it off for you.",
      cta: "Try it",
      weather: "tip",
      ask: "I finished Lab 4.",
    });
    expect(pickClouds({ ...busy, nextAssignment: "A very long assignment title that won't fit" }, "Ray", 1, 20).some((c) => c.key === "finished")).toBe(false);
  });
});
