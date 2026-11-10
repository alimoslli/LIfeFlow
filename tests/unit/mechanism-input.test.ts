import { describe, expect, it } from "vitest";
import { minutesForPx, normalizeWheel, project, rubber, snapTarget, spring, velocity } from "@/components/day-clock/input";

// The mechanism's input (docs/research/2026-11-09-the-mechanism.md, section 7.1).
describe("normalizeWheel", () => {
  const ev = (deltaX: number, deltaY: number, deltaMode = 0, shiftKey = false) => ({ deltaX, deltaY, deltaMode, shiftKey });
  it("turns lines and pages into pixels", () => {
    expect(normalizeWheel(ev(0, 3, 1), 200).px).toBe(120);
    expect(normalizeWheel(ev(0, 1, 2), 200).px).toBe(800);
  });
  it("calls a line step or a lone big pixel step a notch, and a trackpad stream pixels", () => {
    expect(normalizeWheel(ev(0, 3, 1), 10).kind).toBe("notch");
    expect(normalizeWheel(ev(0, 100), 200).kind).toBe("notch");
    expect(normalizeWheel(ev(0, 4), 16).kind).toBe("pixel");
    expect(normalizeWheel(ev(2, 60), 200).kind).toBe("pixel");
  });
  it("takes the larger axis, and Shift turns a mouse wheel sideways", () => {
    expect(normalizeWheel(ev(30, 4), 16)).toMatchObject({ px: 30, axis: "x" });
    expect(normalizeWheel(ev(0, 100, 0, true), 200)).toMatchObject({ px: 100, axis: "x" });
  });
});

describe("the time scale", () => {
  it("moves about 3 hours for a 300 px trackpad swipe on a 1,104 px card", () => {
    expect(minutesForPx(300, 1104) / 60).toBeCloseTo(3.26, 1);
  });
  it("puts 12 hours across any card", () => {
    expect(minutesForPx(390, 390)).toBe(720);
  });
});

describe("momentum and snapping", () => {
  it("projects a coast like iOS (about 499 × the speed)", () => {
    expect(project(0, 1) / 499).toBeCloseTo(1, 2);
  });
  it("lands on now within 45 minutes, a thing within 20, else the quarter hour", () => {
    expect(snapTarget(840 + 40, 840, [900])).toBe(840);
    expect(snapTarget(1000, 840, [1012, 1030])).toBe(1012);
    expect(snapTarget(1003, 840, [1040])).toBe(1005);
  });
  it("rubber-bands about 52 px for a 100 px pull on a 960 px view", () => {
    expect(rubber(100, 960)).toBeCloseTo(51.6, 0);
    expect(rubber(-100, 960)).toBeCloseTo(-51.6, 0);
  });
  it("springs to its target without overshoot, starting at the release speed", () => {
    const xs = Array.from({ length: 60 }, (_, i) => spring(0, 100, 0, i * 10));
    expect(xs[0]).toBe(0);
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9)).toBe(true);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    expect(spring(0, 100, 0, 380)).toBeGreaterThan(97);
    // released moving toward the target at 0.5 per ms: it gets there sooner than from rest
    expect(spring(0, 100, 0.5, 100)).toBeGreaterThan(spring(0, 100, 0, 100));
  });
  it("measures a pointer's speed over the last 80 ms", () => {
    const s = Array.from({ length: 12 }, (_, i) => ({ t: i * 8, v: i * 8 * 2 }));
    expect(velocity(s)).toBeCloseTo(2, 5);
    expect(velocity([{ t: 0, v: 0 }])).toBe(0);
  });
});
