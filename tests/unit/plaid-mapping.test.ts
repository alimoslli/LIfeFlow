import { describe, expect, it } from "vitest";
import { mapPfc } from "@/server/integrations/plaid";

const pfc = (primary: string, detailed = "") => ({ primary, detailed });

describe("Plaid money mapping", () => {
  it("counts payroll and peer payments as income, and own-account moves as transfers", () => {
    expect(mapPfc(pfc("INCOME", "INCOME_WAGES"), 150_000)).toEqual({ category: "Paycheck", kind: "income" });
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"), 40_000, "ZELLE FROM ALEX")).toEqual({ category: "Side Income", kind: "income" });
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_DEPOSIT"), 150_000, "ACME CO DIRECT DEP PAYROLL").kind).toBe("income");
    expect(mapPfc(pfc("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"), 50_000, "TRANSFER FROM SAVINGS 1234")).toEqual({ category: null, kind: "transfer" });
    expect(mapPfc(pfc("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"), -50_000)).toEqual({ category: "Savings Transfer", kind: "transfer" });
  });

  it("keeps spending as spending and store returns as refunds", () => {
    expect(mapPfc(pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), -8_200)).toEqual({ category: "Groceries", kind: "expense" });
    expect(mapPfc(pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING"), 3_000)).toEqual({ category: "Clothing", kind: "refund" });
  });
});
