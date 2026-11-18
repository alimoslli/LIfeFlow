import { describe, expect, it } from "vitest";
import { isOwnTopUp, ownMovePairs, type MoveRow } from "@/lib/own-moves";

const row = (id: string, accountId: string, date: string, amountCents: number, description: string): MoveRow => ({
  id,
  accountId,
  date,
  amountCents,
  merchantName: null,
  description,
});

describe("ownMovePairs (owner, 2026-11-18)", () => {
  it("pairs the same amount out and in on two of their accounts within 3 days, closest first, each once", () => {
    const rows = [
      row("out", "a", "2026-11-10", -40_000, "ZELLE TO SELF"),
      row("far", "b", "2026-11-13", 40_000, "ZELLE FROM SELF"),
      row("near", "b", "2026-11-11", 40_000, "ZELLE FROM SELF"),
    ];
    expect([...ownMovePairs(rows)].sort()).toEqual(["near", "out"]);
  });
  it("never pairs a different amount, the same account, more than 3 days apart, a non-app line or PayPal", () => {
    expect(ownMovePairs([row("o", "a", "2026-11-10", -40_000, "ZELLE TO X"), row("i", "b", "2026-11-10", 39_999, "ZELLE FROM X")]).size).toBe(0);
    expect(ownMovePairs([row("o", "a", "2026-11-10", -40_000, "ZELLE TO X"), row("i", "a", "2026-11-10", 40_000, "ZELLE FROM X")]).size).toBe(0);
    expect(ownMovePairs([row("o", "a", "2026-11-10", -40_000, "ZELLE TO X"), row("i", "b", "2026-11-14", 40_000, "ZELLE FROM X")]).size).toBe(0);
    expect(ownMovePairs([row("o", "a", "2026-11-10", -40_000, "MOBILE XFER"), row("i", "b", "2026-11-10", 40_000, "MOBILE XFER")]).size).toBe(0);
    expect(ownMovePairs([row("o", "a", "2026-11-10", -40_000, "PAYPAL TRANSFER"), row("i", "b", "2026-11-10", 40_000, "PAYPAL TRANSFER")]).size).toBe(0);
  });
  it("reads a top-up into their own balance", () => {
    for (const t of ["PAYPAL ADD MONEY FROM BANK", "Venmo add funds", "CASH APP ADD CASH", "Transfer to PayPal balance"]) expect(isOwnTopUp(t), t).toBe(true);
    for (const t of ["VENMO PAYMENT TO JORDAN", "PAYPAL *SPOTIFY", "ZELLE TO ALEX"]) expect(isOwnTopUp(t), t).toBe(false);
  });
});
