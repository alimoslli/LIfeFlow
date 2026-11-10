import { describe, expect, it } from "vitest";
import { moreLabel, spokenStars, starLabel, sunLabel } from "@/lib/stars";

describe("the stars' words (owner, 2026-11-10: each one says what it was for)", () => {
  it("names what it was for, short enough for one line", () => {
    expect(starLabel("Bio 101", "class")).toBe("Bio 101 · class done");
    expect(starLabel("Target", "work")).toBe("Target · shift done");
    expect(starLabel("Gym", "personal")).toBe("Gym · done");
    expect(starLabel("Study for exam", "study")).toBe("Study for exam · studied");
    expect(starLabel("Introduction to Organic Chemistry Lab", "class")).toBe("Introduction to Organic… · class done");
  });

  it("the sun finishes a run of three or more; one star says how many more past the shown ones", () => {
    expect(sunLabel(2)).toBeNull();
    expect(sunLabel(3)).toBe("3 done while you were away");
    expect(moreLabel(4)).toBe("+4 more done");
  });

  it("screen readers hear what was claimed, in order", () => {
    expect(spokenStars([])).toBe("");
    expect(spokenStars(["Bio 101", "Target"])).toBe("2 done while you were away: Bio 101, Target.");
    expect(spokenStars(["A", "B", "C", "D", "E"])).toBe("5 done while you were away: A, B, C and 2 more.");
  });

  it("no em dashes and no guilt words", () => {
    const all = [starLabel("X", "class"), sunLabel(5)!, moreLabel(2), spokenStars(["X", "Y"])].join(" ");
    expect(all).not.toMatch(/—|missed|slipping|behind|late/i);
  });
});
