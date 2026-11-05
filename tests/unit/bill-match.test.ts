import { describe, expect, it } from "vitest";
import {
  amountsClose,
  nameRelation,
  paidOccurrences,
  scheduleGap,
  tracksSeries,
  type DueOccurrence,
  type PostedCharge,
} from "@/server/services/finance/bill-match";
import type { RecurringCandidate } from "@/server/services/finance/recurring-detect";

const found = (p: Partial<RecurringCandidate>): RecurringCandidate => ({
  merchantKey: "parkview apartments",
  name: "Parkview Apartments",
  kind: "bill",
  frequency: "monthly",
  averageAmountCents: -95_000,
  latestAmountCents: -95_000,
  variableAmount: false,
  occurrences: 3,
  lastDate: "2026-11-01",
  nextExpectedDate: "2026-12-01",
  confidence: 0.75,
  ...p,
});
const rent = {
  name: "Rent, Parkview Apartments",
  merchantKey: "rent parkview apartments",
  amountCents: -95_000,
  frequency: "monthly" as const,
  nextDueDate: "2026-12-01",
};

describe("same bill: a tracked item next to a series found in the bank (A2)", () => {
  it("matches a tracked name that holds the bank's name, in any word order, at the same amount and day", () => {
    expect(tracksSeries(rent, found({}))).toBe(true);
    expect(tracksSeries(rent, found({ merchantKey: "parkview apartments rent" }))).toBe(true);
    // A hand-added "Rent" matches the bank's longer line.
    expect(tracksSeries({ ...rent, name: "Rent", merchantKey: "rent" }, found({ merchantKey: "rent campus edge apts" }))).toBe(true);
  });

  it("keeps two different bills from one landlord apart: a different amount or day is a different bill", () => {
    expect(tracksSeries(rent, found({ latestAmountCents: -7_500, averageAmountCents: -7_500 }))).toBe(false); // parking
    expect(tracksSeries(rent, found({ nextExpectedDate: "2026-12-15" }))).toBe(false);
    expect(tracksSeries(rent, found({ frequency: "weekly" }))).toBe(false);
  });

  it("never matches on amount and day alone", () => {
    const netflix = { name: "Netflix", merchantKey: "netflix", amountCents: -1_549, frequency: "monthly" as const, nextDueDate: "2026-11-15" };
    expect(tracksSeries(netflix, found({ merchantKey: "hulu", latestAmountCents: -1_549, averageAmountCents: -1_549, nextExpectedDate: "2026-11-15" }))).toBe(
      false,
    );
  });

  it("still matches the exact key whatever the amount (a price change or a bill that varies)", () => {
    const netflix = { name: "Netflix", merchantKey: "netflix", amountCents: -1_549, frequency: "monthly" as const, nextDueDate: "2026-11-15" };
    expect(tracksSeries(netflix, found({ merchantKey: "netflix", latestAmountCents: -1_799, nextExpectedDate: "2026-11-20" }))).toBe(true);
  });

  it("allows a wider amount only when the found series itself varies", () => {
    const electric = { name: "Electric", merchantKey: "electric", amountCents: -8_000, frequency: "monthly" as const, nextDueDate: "2026-11-20" };
    const city = found({ merchantKey: "city electric", averageAmountCents: -9_500, latestAmountCents: -11_000, nextExpectedDate: "2026-11-21" });
    expect(tracksSeries(electric, { ...city, variableAmount: true })).toBe(true);
    expect(tracksSeries(electric, { ...city, variableAmount: false })).toBe(false);
  });

  it("needs a date on the tracked item to compare schedules", () => {
    expect(tracksSeries({ ...rent, nextDueDate: null }, found({}))).toBe(false);
  });
});

describe("bill matching helpers", () => {
  it("relates names by equal keys or every word of one inside the other", () => {
    expect(nameRelation(["netflix"], ["netflix", "netflix com ca"])).toBe("same");
    expect(nameRelation(["rent parkview apartments"], ["parkview apartments"])).toBe("contained");
    expect(nameRelation(["parkview rent"], ["parkview apartments"])).toBeNull();
    expect(nameRelation([""], ["parkview apartments"])).toBeNull();
  });

  it("compares amounts in the same direction within 10% or $2, 25% when the amount varies", () => {
    expect(amountsClose(-95_000, -95_000, false)).toBe(true);
    expect(amountsClose(-1_000, -1_190, false)).toBe(true); // $1.90 apart
    expect(amountsClose(-8_500, -7_000, false)).toBe(false);
    expect(amountsClose(-8_200, -6_906, true)).toBe(true);
    expect(amountsClose(-95_000, 95_000, true)).toBe(false);
  });

  it("measures the gap between two dates on one schedule", () => {
    expect(scheduleGap("2026-12-01", "2027-01-02", "monthly")).toBe(1);
    expect(scheduleGap("2027-01-01", "2026-12-01", "monthly")).toBe(0);
    expect(scheduleGap("2026-12-31", "2027-01-01", "monthly")).toBe(1);
    expect(scheduleGap("2026-11-02", "2026-11-17", "weekly")).toBe(1);
  });
});

describe("a bill that already posted is paid for that cycle (A3)", () => {
  const due = (p: Partial<DueOccurrence>): DueOccurrence => ({
    name: "City Utilities",
    merchantKey: "city utilities",
    kind: "bill",
    frequency: "monthly",
    date: "2026-11-05",
    amountCents: -8_200,
    ...p,
  });
  const charge = (p: Partial<PostedCharge>): PostedCharge => ({
    date: "2026-11-05",
    amountCents: -6_906,
    merchantName: "City Utilities",
    description: "CITY UTILITIES",
    kind: "expense",
    pending: false,
    ...p,
  });
  const paid = (d: DueOccurrence[], c: PostedCharge[]) => [...paidOccurrences(d, c)].sort();

  it("counts a charge on the due date or a few days before, at the bill's amount (a utility may vary)", () => {
    expect(paid([due({})], [charge({})])).toEqual([0]);
    expect(paid([due({})], [charge({ date: "2026-11-03" })])).toEqual([0]);
    expect(
      paid(
        [due({ name: "Rent, Parkview Apartments", merchantKey: null, amountCents: -95_000 })],
        [charge({ merchantName: "Parkview Apartments", description: "PARKVIEW APARTMENTS RENT", amountCents: -95_000 })],
      ),
    ).toEqual([0]);
  });

  it("doesn't count a charge too early, after the due date, still pending, a refund, another merchant or another amount", () => {
    expect(paid([due({})], [charge({ date: "2026-10-30" })])).toEqual([]);
    expect(paid([due({})], [charge({ date: "2026-11-06" })])).toEqual([]);
    expect(paid([due({})], [charge({ pending: true })])).toEqual([]);
    expect(paid([due({ amountCents: 8_200, kind: "income" })], [charge({ amountCents: 8_200, kind: "refund" })])).toEqual([]);
    expect(paid([due({})], [charge({ merchantName: "Georgia Power", description: "GEORGIA POWER" })])).toEqual([]);
    expect(
      paid(
        [due({ kind: "subscription", amountCents: -1_549, name: "Netflix", merchantKey: "netflix" })],
        [charge({ merchantName: "Netflix", description: "NETFLIX.COM", amountCents: -2_299 })],
      ),
    ).toEqual([]);
    // A name inside the other needs the amount to hold (10% or $2), even for a bill.
    expect(
      paid(
        [due({ name: "Parkview Apartments", merchantKey: null, amountCents: -95_000 })],
        [charge({ merchantName: null, description: "PARKVIEW APARTMENTS PARKING", amountCents: -7_500 })],
      ),
    ).toEqual([]);
  });

  it("lets one charge pay one bill, the closest amount first", () => {
    const phone = due({ name: "Verizon", merchantKey: "verizon", amountCents: -8_500 });
    const internet = due({ name: "Verizon", merchantKey: "verizon", amountCents: -7_000 });
    expect(paid([phone, internet], [charge({ merchantName: "Verizon", description: "VERIZON", amountCents: -7_000 })])).toEqual([1]);
    expect(paid([due({}), due({})], [charge({})])).toEqual([0]);
  });
});
