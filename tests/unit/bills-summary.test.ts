import { describe, expect, it } from "vitest";
import { billsSummary } from "@/server/services/finance/bills-summary";

// Student test, 2026-11-16: Bills said "$0 a month, nothing yet" while four regular charges were found in the bank and Money counted them.
describe("billsSummary", () => {
  const found = [
    { latestAmountCents: -4500, frequency: "monthly", kind: "bill" },
    { latestAmountCents: -15400, frequency: "monthly", kind: "bill" },
    { latestAmountCents: -40000, frequency: "monthly", kind: "bill" },
    { latestAmountCents: -799, frequency: "monthly", kind: "subscription" },
  ];
  it("counts the charges found in the bank when nothing is tracked yet", () => {
    const s = billsSummary([], found);
    expect(s.monthlyCents).toBe(60699);
    expect(s.count).toBe(4);
    expect(s.yearlyCents).toBe(60699 * 12);
  });
  it("counts a charge once: tracked or found, never both", () => {
    const tracked = [{ amountCents: -4500, status: "active", frequency: "monthly" }];
    expect(billsSummary(tracked, found.slice(1)).monthlyCents).toBe(60699);
    expect(billsSummary(tracked, found.slice(1)).count).toBe(4);
  });
  it("leaves out income, pennies, paused and cancelled", () => {
    const s = billsSummary(
      [
        { amountCents: -1000, status: "paused", frequency: "monthly" },
        { amountCents: 200000, status: "active", frequency: "monthly" },
      ],
      [
        { latestAmountCents: -50, frequency: "monthly" },
        { latestAmountCents: 3000, frequency: "monthly", kind: "income" },
      ],
    );
    expect(s).toMatchObject({ monthlyCents: 0, count: 0 });
  });
  it("turns other rhythms into an average month in whole cents", () => {
    expect(billsSummary([{ amountCents: -1200, status: "active", frequency: "yearly" }], []).monthlyCents).toBe(100);
    expect(billsSummary([], [{ latestAmountCents: -1000, frequency: "weekly" }]).monthlyCents).toBe(4333);
  });
});
