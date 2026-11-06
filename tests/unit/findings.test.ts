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

describe("double charges on bills and subscriptions, however long they've run (A7)", () => {
  const spotify = (date: string) => ({
    date,
    amountCents: -1_199,
    merchantName: "Spotify",
    description: "Spotify USA",
    kind: "expense",
    categoryName: "Streaming",
  });
  const history = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"];

  it("flags Spotify billed twice on Oct 15 with 4 months or 10 months of history, and with 2", () => {
    for (const months of [history.slice(-4), history, history.slice(-2)])
      expect(scanTransactions([...months, "2026-10-15"].map(spotify), "2026-11-05").doubleCharges).toEqual([
        { merchant: "Spotify", amountCents: 1_199, dates: ["2026-10-15", "2026-10-15"] },
      ]);
  });

  it("flags a second charge the next day, and rent sent twice by Zelle", () => {
    expect(scanTransactions([...history, "2026-10-16"].map(spotify), "2026-11-05").doubleCharges).toEqual([
      { merchant: "Spotify", amountCents: 1_199, dates: ["2026-10-15", "2026-10-16"] },
    ]);
    const zelle = (date: string) => ({ date, amountCents: -60_000, merchantName: null, description: "ZELLE TO JORDAN M", kind: "transfer" });
    expect(scanTransactions(["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-11-02"].map(zelle), "2026-11-05").doubleCharges).toEqual([
      { merchant: "ZELLE TO JORDAN M", amountCents: 60_000, dates: ["2026-11-01", "2026-11-02"] },
    ]);
  });

  it("doesn't flag a charge outside the last 30 days, two identical subscriptions billed together every month, or months of the same daily latte", () => {
    expect(scanTransactions([...history, "2026-09-15"].map(spotify), "2026-11-05").doubleCharges).toEqual([]);
    expect(
      scanTransactions(
        history.flatMap((d) => [spotify(d), spotify(d)]),
        "2026-11-05",
      ).doubleCharges,
    ).toEqual([]);
    const latte = (date: string) => ({ date, amountCents: -545, merchantName: "Starbucks", description: "STARBUCKS", kind: "expense", categoryName: "Coffee" });
    const days = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 6, 8) + i * 86_400_000).toISOString().slice(0, 10));
    expect(scanTransactions(days.map(latte), "2026-11-05").doubleCharges).toEqual([]);
  });
});

describe("no false double charges (review 6)", () => {
  const charge = (date: string, amountCents: number, description = "Spotify USA", kind = amountCents < 0 ? "expense" : "refund") => ({
    date,
    amountCents,
    merchantName: null,
    description,
    kind,
  });
  const months = (from: number, to: number, day: string, cents: number, description?: string) =>
    Array.from({ length: to - from + 1 }, (_, i) => charge(`2026-${String(from + i).padStart(2, "0")}-${day}`, cents, description));

  it("leaves out a double charge already refunded, and a refund followed by a fresh charge", () => {
    const base = months(5, 9, "15", -1_199);
    expect(
      scanTransactions([...base, charge("2026-10-15", -1_199), charge("2026-10-15", -1_199), charge("2026-10-17", 1_199)], "2026-11-05").doubleCharges,
    ).toEqual([]);
    expect(
      scanTransactions([...base, charge("2026-10-15", -1_199), charge("2026-10-15", 1_199), charge("2026-10-16", -1_199)], "2026-11-05").doubleCharges,
    ).toEqual([]);
  });

  it("treats a second line or plan billed beside the first every month as two items, after its first month", () => {
    const line = months(1, 10, "13", -4_500, "VERIZON WIRELESS PAYMENTS");
    const second = (to: number) => months(9, to, "13", -4_500, "VERIZON WIRELESS PAYMENTS");
    // September: a new line or a double charge? It's flagged once...
    expect(scanTransactions([...line.slice(0, 9), ...second(9)], "2026-09-20").doubleCharges).toHaveLength(1);
    // ...and from October, when it's billed again, it's a second line.
    expect(scanTransactions([...line, ...second(10)], "2026-10-20").doubleCharges).toEqual([]);
    const plans = [...months(1, 10, "15", -1_549, "NETFLIX.COM"), ...months(9, 10, "16", -1_549, "NETFLIX.COM")];
    expect(scanTransactions(plans, "2026-10-20").doubleCharges).toEqual([]);
  });
});
