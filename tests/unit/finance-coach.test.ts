import { describe, expect, it } from "vitest";
import { keywordCategory, needOrWant } from "@/server/services/finance/categorize";
import { simulatePayoff } from "@/server/services/finance/coach";
import { budgetPace, projectCash, skippableMerchant } from "@/server/services/finance/forecast";
import { goalProjection, goalTradeoff } from "@/server/services/finance/goals";
import { projectInvesting } from "@/server/services/finance/investing";

describe("cash forecast", () => {
  it("finds the lowest point and an overdraft, with and without expected pay", () => {
    const p = projectCash({
      startCents: 50_000,
      today: "2026-10-28",
      days: 10,
      bills: [{ date: "2026-10-30", amountCents: -45_000, name: "Rent" }],
      income: [{ date: "2026-10-31", amountCents: 100_000, name: "Payroll" }],
      dailySpendCents: 2_000,
    });
    expect(p.points[0]).toEqual({ date: "2026-10-28", withoutPayCents: 50_000, withPayCents: 50_000 });
    expect(p.points[2].withoutPayCents).toBe(50_000 - 4_000 - 45_000); // 2 days of spending + rent
    expect(p.overdraftDateWithoutPay).toBe("2026-10-31");
    expect(p.overdraftDateWithPay).toBeNull();
    expect(p.lowestWithPay).toEqual({ date: "2026-10-30", cents: 1_000 });
  });
});

describe("budget pace", () => {
  it("warns early with a merchant-specific fix", () => {
    const p = budgetPace({
      category: "Food & Dining",
      limitCents: 45_000,
      spentCents: 30_000,
      today: "2026-10-14",
      topMerchant: { name: "DoorDash", avgCents: 4_000, count: 6 },
    });
    expect(p.status).toBe("heading_over");
    expect(p.projectedCents).toBe(66_429);
    expect(p.fix).toBe("Skip 6 DoorDash purchases (about $40 each) and you're back on track.");
  });
  it("falls back to a daily limit, and says plainly when already over", () => {
    expect(budgetPace({ category: "Shopping", limitCents: 20_000, spentCents: 15_000, today: "2026-10-10", topMerchant: null }).fix).toBe(
      "Keep Shopping to about $2.38 a day for the last 21 days to stay within budget.",
    );
    expect(budgetPace({ category: "Shopping", limitCents: 20_000, spentCents: 25_000, today: "2026-10-10", topMerchant: null }).status).toBe("over");
    expect(budgetPace({ category: "Shopping", limitCents: 20_000, spentCents: 1_000, today: "2026-10-02", topMerchant: null }).status).toBe("on_track");
  });
});

describe("the budget fix never cuts essentials (A17)", () => {
  const buy = (merchantName: string, amountCents: number, categoryName: string | null) => ({
    merchantName,
    description: merchantName.toUpperCase(),
    amountCents,
    categoryName,
  });

  it("suggests the biggest discretionary merchant, never groceries", () => {
    const food = [
      ...Array.from({ length: 10 }, () => buy("Trader Joe's", -4_050, "Groceries")),
      ...Array.from({ length: 4 }, () => buy("Chipotle", -1_250, "Restaurants")),
      ...Array.from({ length: 2 }, () => buy("DoorDash", -3_100, "Food Delivery")),
    ];
    expect(skippableMerchant(food)).toEqual({ name: "DoorDash", avgCents: 3_100, count: 2 });
    // Filed under the vague parent category, a grocery store is still a grocery store.
    expect(
      skippableMerchant([...Array.from({ length: 5 }, () => buy("Trader Joe's", -4_050, "Food & Dining")), buy("Chipotle", -1_250, "Restaurants")]),
    ).toBeNull();
  });

  it("says nothing for rent, utilities, medical or getting to work, so the per-day limit is used", () => {
    const essentials = [
      ...Array.from({ length: 3 }, () => buy("Shell", -4_000, "Gas")),
      ...Array.from({ length: 3 }, () => buy("CVS", -2_000, "Pharmacy")),
      ...Array.from({ length: 2 }, () => buy("City Utilities", -8_000, "Utilities")),
      ...Array.from({ length: 2 }, () => buy("MTA", -290, "Public Transit")),
      ...Array.from({ length: 2 }, () => buy("Campus Edge Apts", -95_000, "Rent")),
    ];
    expect(skippableMerchant(essentials)).toBeNull();
    const p = budgetPace({ category: "Groceries", limitCents: 30_000, spentCents: 25_000, today: "2026-10-14", topMerchant: skippableMerchant(essentials) });
    expect(p.fix).toBe("Keep Groceries to about $2.94 a day for the last 17 days to stay within budget.");
  });
});

describe("goals", () => {
  it("projects the finish date and the effect of saving more", () => {
    expect(goalProjection({ targetCents: 300_000, savedCents: 60_000, targetDate: "2027-06-01" }, 20_000, "2026-10-28")).toMatchObject({
      remainingCents: 240_000,
      monthsToGo: 12,
      onTrack: false,
    });
    expect(goalTradeoff({ targetCents: 300_000, savedCents: 60_000 }, 20_000, 6_000)).toEqual({ monthsBefore: 12, monthsAfter: 10, monthsSooner: 2 });
    expect(goalProjection({ targetCents: 100, savedCents: 100, targetDate: null }, 0, "2026-10-28").monthsToGo).toBe(0);
    expect(goalProjection({ targetCents: 1000, savedCents: 0, targetDate: null }, 0, "2026-10-28").projectedDate).toBeNull();
  });
});

describe("debts and investing", () => {
  it("pays off highest rate first and counts interest", () => {
    const r = simulatePayoff([{ name: "Card", balanceCents: 100_000, apr: 24, minCents: 5_000 }], 5_000)!;
    expect(r.months).toBe(12); // $1,000 at 24% paying $100 a month: 11.3 months, so 12
    expect(r.interestCents).toBeGreaterThan(0);
    expect(simulatePayoff([{ name: "Card", balanceCents: 1_000_000, apr: 30, minCents: 1_000 }], 0)!.months).toBeNull();
  });
  it("projects compound growth as a range of assumptions", () => {
    const p = projectInvesting({ startCents: 0, monthlyCents: 10_000, years: 40, ratesPercent: [6] });
    expect(p.contributedCents).toBe(4_800_000);
    expect(Math.round(p.scenarios[0].valueCents / 100)).toBe(199_149);
  });
});

describe("categorization", () => {
  it("knows common merchants and stays quiet on ambiguous ones", () => {
    expect(keywordCategory({ description: "DOORDASH*CHIPOTLE" })).toBe("Food Delivery");
    expect(keywordCategory({ description: "STARBUCKS STORE 123" })).toBe("Coffee");
    expect(keywordCategory({ merchantName: "Uber", description: "UBER TRIP" })).toBe("Rideshare");
    expect(keywordCategory({ description: "VENMO PAYMENT" })).toBeNull();
    expect(keywordCategory({ description: "Max's Diner" })).toBe("Restaurants");
    expect(needOrWant("Rent")).toBe("need");
    expect(needOrWant("Restaurants")).toBe("want");
  });
});
