import { describe, expect, it } from "vitest";
import { choosePose, type PoseInputs } from "@/components/day-clock/pose";

const plain: PoseInputs = { follow: true, moved: false, sleep: false, morning: false, doing: null, reduce: false, tick: 0 };

// Owner, 2026-11-11: the skyling's little life. The page's own moment first, then asleep, then the real day. Never a guess.
describe("what the skyling does now (day-clock/pose.ts)", () => {
  it("waves, thinks or looks surprised when the page says so, even at night", () => {
    expect(choosePose({ ...plain, doing: "wave" })).toBe("wave");
    expect(choosePose({ ...plain, doing: "think", sleep: true })).toBe("think");
    expect(choosePose({ ...plain, doing: "surprised", live: "class" })).toBe("surprised");
  });

  it("is asleep late at night when nothing is happening", () => {
    expect(choosePose({ ...plain, sleep: true })).toBe("sleep");
  });

  it("reads through a class and drinks coffee on a shift", () => {
    expect(choosePose({ ...plain, live: "class" })).toBe("read");
    expect(choosePose({ ...plain, live: "work" })).toBe("sip");
  });

  it("stretches now and then in the morning, and walks in between", () => {
    expect(choosePose({ ...plain, morning: true, tick: 0 })).toBe("stretch");
    expect(choosePose({ ...plain, morning: true, tick: 1 })).toBe("walk");
    expect(choosePose({ ...plain, morning: true, tick: 4 })).toBe("stretch");
  });

  it("walks on a plain day, and turning the wheel ignores what the page says", () => {
    expect(choosePose(plain)).toBe("walk");
    expect(choosePose({ ...plain, moved: true, doing: "wave" })).toBe("walk");
  });

  it("looked at a time the wheel isn't following: it walks and doesn't say hello", () => {
    expect(choosePose({ ...plain, follow: false, doing: "wave" })).toBe("walk");
  });

  it("with reduced motion it stands still, and the page's moments are left out", () => {
    expect(choosePose({ ...plain, reduce: true })).toBe("idle");
    expect(choosePose({ ...plain, reduce: true, doing: "wave" })).toBe("idle");
    expect(choosePose({ ...plain, reduce: true, doing: "think" })).toBe("idle");
    expect(choosePose({ ...plain, reduce: true, doing: "surprised" })).toBe("idle");
    expect(choosePose({ ...plain, reduce: true, sleep: true })).toBe("sleep");
    expect(choosePose({ ...plain, reduce: true, live: "class" })).toBe("read");
  });
});
