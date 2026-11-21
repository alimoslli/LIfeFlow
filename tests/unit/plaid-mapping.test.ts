import { describe, expect, it } from "vitest";
import { mapPfc } from "@/server/integrations/plaid";

const pfc = (primary: string, detailed = "") => ({ primary, detailed });

describe("Plaid money mapping", () => {
  it("counts payroll and peer payments as money in, and own-account moves as transfers", () => {
    expect(mapPfc(pfc("INCOME", "INCOME_WAGES"), 150_000)).toEqual({ category: "Paycheck", kind: "income" });
    // money from a person came in, but nothing says it is pay for work: no category to guess (student test, 2026-11-16)
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"), 40_000, "ZELLE FROM ALEX")).toEqual({ category: null, kind: "income" });
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_DEPOSIT"), 150_000, "ACME CO DIRECT DEP PAYROLL").kind).toBe("income");
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"), 50_000, "TRANSFER FROM SAVINGS 1234")).toEqual({ category: null, kind: "transfer" });
    expect(mapPfc(pfc("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"), -50_000)).toEqual({ category: "Savings Transfer", kind: "transfer" });
  });

  it("keeps spending as spending and store returns as refunds", () => {
    expect(mapPfc(pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), -8_200)).toEqual({ category: "Groceries", kind: "expense" });
    expect(mapPfc(pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING"), 3_000)).toEqual({ category: "Clothing", kind: "refund" });
  });
});

describe("Plaid category vs. statement keywords", () => {
  it("keeps Plaid's specific category, but a named merchant beats a vague one", async () => {
    const { pickCategory } = await import("@/server/integrations/plaid");
    expect(pickCategory({ category: "Restaurants", kind: "expense" }, "Coffee")).toBe("Restaurants");
    expect(pickCategory({ category: "Other", kind: "expense" }, "Software")).toBe("Software");
    expect(pickCategory({ category: "Household", kind: "expense" }, "Bills & Subscriptions")).toBe("Bills & Subscriptions");
    expect(pickCategory({ category: null, kind: "transfer" }, "Credit Card Payment")).toBe("Credit Card Payment");
    expect(pickCategory({ category: "Side Income", kind: "income" }, "Paycheck")).toBe("Side Income");
  });
});
