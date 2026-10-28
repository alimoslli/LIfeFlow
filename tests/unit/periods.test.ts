import { describe, expect, it } from "vitest";
import { rangeLabel, resolvePeriod } from "@/lib/periods";

describe("periods", () => {
  it("names every range in plain words", () => {
    expect(resolvePeriod(undefined, "2026-10-28")).toEqual({ key: "month", from: "2026-10-01", to: "2026-10-28", label: "Oct 1 to 28, 2026" });
    expect(resolvePeriod("last_month", "2026-10-28")).toMatchObject({ from: "2026-09-01", to: "2026-09-30", label: "Sep 1 to 30, 2026" });
    expect(resolvePeriod("90d", "2026-10-28")).toMatchObject({ from: "2026-07-31", to: "2026-10-28", label: "Jul 31 to Oct 28, 2026" });
    expect(resolvePeriod("year", "2026-10-28").from).toBe("2026-01-01");
    expect(resolvePeriod("all", "2026-10-28").label).toBe("All time to Oct 28, 2026");
    expect(rangeLabel("2025-12-20", "2026-01-05")).toBe("Dec 20, 2025 to Jan 5, 2026");
    expect(rangeLabel("2026-10-28", "2026-10-28")).toBe("Oct 28, 2026");
  });

  it("uses a custom range only when it is valid", () => {
    expect(resolvePeriod("month", "2026-10-28", { from: "2026-10-05", to: "2026-10-10" })).toMatchObject({ key: "custom", label: "Oct 5 to 10, 2026" });
    expect(resolvePeriod("month", "2026-10-28", { from: "2026-10-10", to: "2026-10-05" }).key).toBe("month");
    expect(resolvePeriod("month", "2026-10-28", { from: "nope", to: "2026-10-05" }).key).toBe("month");
  });
});
