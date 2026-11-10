import { describe, expect, it } from "vitest";
import { closestAim, squares } from "../../src/app/(app)/goals/closest";

describe("closest goal", () => {
  it("picks the one nearest to done", () => {
    const a = { key: "a", fraction: 0.2, date: "2026-12-01" };
    const b = { key: "b", fraction: 0.58, date: null };
    const c = { key: "c", fraction: null, date: "2026-11-20" };
    expect(closestAim([a, b, c])?.key).toBe("b");
  });
  it("with no numbers, the earliest date, then the first", () => {
    expect(
      closestAim([
        { key: "x", fraction: null, date: "2026-12-14" },
        { key: "y", fraction: null, date: "2026-11-30" },
      ])?.key,
    ).toBe("y");
    expect(
      closestAim([
        { key: "p", fraction: null, date: null },
        { key: "q", fraction: null, date: null },
      ])?.key,
    ).toBe("p");
    expect(closestAim([])).toBeNull();
  });
  it("squares: one per unit up to 12, else twelve", () => {
    expect(squares(7, 12)).toEqual({ filled: 7, count: 12 });
    expect(squares(2, 5)).toEqual({ filled: 2, count: 5 });
    expect(squares(50, 100)).toEqual({ filled: 6, count: 12 });
    expect(squares(1, 1000)).toEqual({ filled: 1, count: 12 });
    expect(squares(0, 0)).toEqual({ filled: 0, count: 0 });
  });
});
