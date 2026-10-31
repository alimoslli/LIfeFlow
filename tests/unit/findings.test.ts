import { describe, expect, it } from "vitest";
import { scanTransactions } from "@/server/services/finance/findings";
import { TODAY, txns } from "../fixtures/student-bank";

describe("money findings on a real-looking bank feed", () => {
  it("catches the double charge and the bank fees, and not the daily coffee or the pending Netflix copy", () => {
    const r = scanTransactions(txns, TODAY);
    expect(r.doubleCharges).toEqual([{ merchant: "Target", amountCents: 4218, dates: ["2026-10-22", "2026-10-23"] }]);
    expect(r.fees.map((f) => [f.description, f.amountCents])).toEqual([
      ["OVERDRAFT FEE FOR A TRANSACTION", 3500],
      ["NON-NETWORK ATM FEE", 300],
    ]);
    expect(r.feesTotalCents).toBe(3800);
  });

  it("doesn't call a regular same-price purchase a double charge", () => {
    const latte = (date: string) => ({ date, amountCents: -545, merchantName: "Starbucks", description: "STARBUCKS", kind: "expense" });
    const days = ["2026-10-01", "2026-10-02", "2026-10-06", "2026-10-07", "2026-10-08"];
    expect(scanTransactions(days.map(latte), "2026-10-10").doubleCharges).toEqual([]);
  });
});
