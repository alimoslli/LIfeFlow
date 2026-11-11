import { describe, expect, it } from "vitest";
import { moreLabel, spokenStars, starLabel, starPush, runLabel } from "@/lib/stars";

describe("the stars' words (owner, 2026-11-10: each one says what it was for)", () => {
  it("names what it was for, short enough for one line", () => {
    expect(starLabel("Bio 101", "class")).toBe("Bio 101 · class done");
    expect(starLabel("Target", "work")).toBe("Target · shift done");
    expect(starLabel("Gym", "personal")).toBe("Gym · done");
    expect(starLabel("Study for exam", "study")).toBe("Study for exam · studied");
    expect(starLabel("Introduction to Organic Chemistry Lab", "class")).toBe("Introduction to Organic… · class done");
  });

  it("the sun finishes a run of three or more; one star says how many more past the shown ones", () => {
    expect(runLabel(2)).toBeNull();
    expect(runLabel(3)).toBe("3 done while you were away");
    expect(moreLabel(4)).toBe("+4 more done");
  });

  it("screen readers hear what was claimed, in order", () => {
    expect(spokenStars([])).toBe("");
    expect(spokenStars(["Bio 101", "Target"])).toBe("2 done while you were away: Bio 101, Target.");
    expect(spokenStars(["A", "B", "C", "D", "E"])).toBe("5 done while you were away: A, B, C and 2 more.");
  });

  it("no em dashes and no guilt words", () => {
    const all = [starLabel("X", "class"), runLabel(5)!, moreLabel(2), spokenStars(["X", "Y"])].join(" ");
    expect(all).not.toMatch(/—|missed|slipping|behind|late/i);
  });
});

describe("the note when something ends (owner, 2026-11-10)", () => {
  it("says what ended and that its star is waiting, and the tap is the claim", () => {
    expect(starPush("Ray", [{ title: "Target", kind: "work" }])).toEqual({
      title: "Ray has a star for you",
      body: "Your Target shift is over. Tap to claim your star on your sky.",
    });
    expect(starPush("Nova", [{ title: "Bio 101", kind: "class" }]).body).toBe("Bio 101 is over. Tap to claim your star on your sky.");
    expect(
      starPush("Ray", [
        { title: "Target", kind: "work" },
        { title: "Gym", kind: "personal" },
      ]),
    ).toEqual({
      title: "Ray has 2 stars for you",
      body: "Your Target shift and Gym are over. Tap to claim them on your sky.",
    });
    expect(
      starPush("Ray", [
        { title: "A", kind: "class" },
        { title: "B", kind: "class" },
        { title: "C", kind: "class" },
      ]).body,
    ).toBe("A, B and 1 more are over. Tap to claim them on your sky.");
  });

  it("follows the push rules: no blame, no pressure, no em dash, no counters", () => {
    const lines = [
      starPush("Ray", [{ title: "Target", kind: "work" }]),
      starPush("Ray", [
        { title: "X", kind: "class" },
        { title: "Y", kind: "study" },
      ]),
    ].flatMap((p) => [p.title, p.body]);
    for (const l of lines) expect(l).not.toMatch(/—|you ignored|you missed|slipping|you haven't|failed|streak|don't lose|hurry/i);
  });
});
