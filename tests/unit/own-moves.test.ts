import { describe, expect, it } from "vitest";
import { isOwnTopUp, namesSelf, ownMovePairs, type MoveRow } from "@/lib/own-moves";

const ME = "Maya Lopez";
const row = (id: string, accountId: string, date: string, amountCents: number, description: string, more: Partial<MoveRow> = {}): MoveRow => ({
  id,
  accountId,
  date,
  amountCents,
  merchantName: null,
  description,
  kind: amountCents < 0 ? "transfer" : "income",
  ...more,
});
const pairs = (rows: MoveRow[]) => [...ownMovePairs(rows, ME)].sort();

describe("ownMovePairs (owner, 2026-11-18; QA F1 to F3)", () => {
  it("pairs the same amount out and in on two of their accounts within 3 days, by the same app, closest first, each once", () => {
    expect(
      pairs([
        row("out", "a", "2026-11-10", -40_000, "ZELLE TO MAYA LOPEZ"),
        row("far", "b", "2026-11-13", 40_000, "ZELLE FROM MAYA LOPEZ"),
        row("near", "b", "2026-11-11", 40_000, "ZELLE FROM MAYA LOPEZ"),
      ]),
    ).toEqual(["near", "out"]);
  });
  it("never pairs a different amount, the same account, more than 3 days apart, a non-app line or PayPal", () => {
    const o = (d = "ZELLE TO SELF") => row("o", "a", "2026-11-10", -40_000, d);
    expect(pairs([o(), row("i", "b", "2026-11-10", 39_999, "ZELLE FROM SELF")])).toEqual([]);
    expect(pairs([o(), row("i", "a", "2026-11-10", 40_000, "ZELLE FROM SELF")])).toEqual([]);
    expect(pairs([o(), row("i", "b", "2026-11-14", 40_000, "ZELLE FROM SELF")])).toEqual([]);
    expect(pairs([o("MOBILE XFER SELF"), row("i", "b", "2026-11-10", 40_000, "MOBILE XFER SELF")])).toEqual([]);
    expect(pairs([o("PAYPAL TRANSFER SELF"), row("i", "b", "2026-11-10", 40_000, "PAYPAL TRANSFER SELF")])).toEqual([]);
  });
  it("F2: a Venmo to a friend and a sister's Zelle of the same amount are not a move", () => {
    expect(pairs([row("o", "a", "2026-11-10", -2_000, "VENMO PAYMENT TO JORDAN M"), row("i", "b", "2026-11-11", 2_000, "ZELLE FROM ANA LOPEZ")])).toEqual([]);
    // the same app but nobody says it's theirs: left alone
    expect(pairs([row("o", "a", "2026-11-10", -2_000, "ZELLE TO JORDAN M"), row("i", "b", "2026-11-11", 2_000, "ZELLE FROM ANA LOPEZ")])).toEqual([]);
    // different apps even when both say self
    expect(pairs([row("o", "a", "2026-11-10", -2_000, "VENMO TO SELF"), row("i", "b", "2026-11-11", 2_000, "ZELLE FROM SELF")])).toEqual([]);
  });
  it("F1: a row the person categorized never pairs", () => {
    expect(
      pairs([row("o", "a", "2026-11-10", -50_000, "ZELLE TO SELF", { categoryId: "rent" }), row("i", "b", "2026-11-11", 50_000, "ZELLE FROM SELF")]),
    ).toEqual([]);
  });
  it("F3: an out already settled with one in keeps it; a later, closer twin doesn't take it", () => {
    expect(
      pairs([
        row("out", "a", "2026-11-10", -40_000, "ZELLE TO SELF"),
        row("settled", "b", "2026-11-13", 40_000, "ZELLE FROM SELF", { kind: "transfer" }),
        row("twin", "c", "2026-11-10", 40_000, "ZELLE FROM SELF"),
      ]),
    ).toEqual(["out", "settled"]);
  });
  it("reads the person's own name and self words", () => {
    expect(namesSelf("ZELLE TO MAYA R LOPEZ", ME)).toBe(true);
    expect(namesSelf("Zelle transfer to own account", null)).toBe(true);
    expect(namesSelf("ZELLE FROM ANA LOPEZ", ME)).toBe(false);
    expect(namesSelf("ZELLE TO MAYA", ME)).toBe(false);
  });
  it("reads a top-up into their own balance", () => {
    for (const t of ["PAYPAL ADD MONEY FROM BANK", "Venmo add funds", "CASH APP ADD CASH", "Transfer to PayPal balance"]) expect(isOwnTopUp(t), t).toBe(true);
    for (const t of ["VENMO PAYMENT TO JORDAN", "PAYPAL *SPOTIFY", "ZELLE TO ALEX"]) expect(isOwnTopUp(t), t).toBe(false);
  });
});
