import { describe, expect, it } from "vitest";
import {
  PAID_EARLY_DAYS,
  amountsClose,
  billVaries,
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
  seriesKey: "parkview apartments",
  dueDay: 1,
  priceChange: null,
  charges: [],
  duplicates: [],
  transfer: false,
  formerKeys: [],
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
    expect(tracksSeries(rent, found({ lastDate: "2026-11-15", nextExpectedDate: "2026-12-15" }))).toBe(false);
    expect(tracksSeries(rent, found({ frequency: "weekly" }))).toBe(false);
  });

  it("still matches when the last rent was paid a week early, which moves the series' next date", () => {
    const early = found({ merchantKey: "rent campus edge apts", lastDate: "2026-11-24", nextExpectedDate: "2026-12-24" });
    expect(tracksSeries({ ...rent, name: "Rent", merchantKey: "rent" }, early)).toBe(true);
  });

  it("never matches on amount and day alone", () => {
    const netflix = { name: "Netflix", merchantKey: "netflix", amountCents: -1_549, frequency: "monthly" as const, nextDueDate: "2026-11-15" };
    const hulu = found({ merchantKey: "hulu", latestAmountCents: -1_549, averageAmountCents: -1_549, lastDate: "2026-10-15", nextExpectedDate: "2026-11-15" });
    expect(tracksSeries(netflix, hulu)).toBe(false);
  });

  it("still matches the exact key whatever the amount (a price change or a bill that varies)", () => {
    const netflix = { name: "Netflix", merchantKey: "netflix", amountCents: -1_549, frequency: "monthly" as const, nextDueDate: "2026-11-15" };
    expect(tracksSeries(netflix, found({ merchantKey: "netflix", latestAmountCents: -1_799, nextExpectedDate: "2026-11-20" }))).toBe(true);
  });

  it("never matches money coming in with money going out, even under the same name", () => {
    const pay = { name: "State University", merchantKey: "state university", amountCents: 120_000, frequency: "biweekly" as const, nextDueDate: "2026-11-13" };
    const tuition = found({ merchantKey: "state university", latestAmountCents: -50_000, averageAmountCents: -50_000, nextExpectedDate: "2026-11-15" });
    expect(tracksSeries(pay, tuition)).toBe(false);
    expect(tracksSeries({ ...pay, frequency: "monthly", amountCents: 50_000, nextDueDate: "2026-11-15" }, tuition)).toBe(false);
  });

  it("allows a wider amount only when the found series itself varies", () => {
    const electric = { name: "Electric", merchantKey: "electric", amountCents: -8_000, frequency: "monthly" as const, nextDueDate: "2026-11-20" };
    const city = found({
      merchantKey: "city electric",
      averageAmountCents: -9_500,
      latestAmountCents: -11_000,
      lastDate: "2026-10-21",
      nextExpectedDate: "2026-11-21",
    });
    expect(tracksSeries(electric, { ...city, variableAmount: true })).toBe(true);
    expect(tracksSeries(electric, { ...city, variableAmount: false })).toBe(false);
  });

  it("needs a date on the tracked item to compare schedules", () => {
    expect(tracksSeries({ ...rent, nextDueDate: null }, found({}))).toBe(false);
  });
});

describe("a bill tracked under the user's own name and paid by transfer (review 3)", () => {
  const zelle = found({ merchantKey: "zelle to jordan m", name: "Zelle To Jordan M", latestAmountCents: -60_000, averageAmountCents: -60_000, transfer: true });
  const rentItem = { name: "Rent", merchantKey: "rent", amountCents: -60_000, frequency: "monthly" as const, nextDueDate: "2026-12-01" };

  it("matches on the same amount and schedule alone", () => {
    expect(tracksSeries(rentItem, zelle)).toBe(true);
    expect(tracksSeries({ ...rentItem, name: "Car loan", merchantKey: "car loan" }, zelle)).toBe(true);
  });

  it("still needs the amount, the schedule and the direction", () => {
    expect(tracksSeries({ ...rentItem, amountCents: -45_000 }, zelle)).toBe(false);
    expect(tracksSeries({ ...rentItem, nextDueDate: "2026-12-16" }, zelle)).toBe(false);
    expect(tracksSeries({ ...rentItem, frequency: "weekly" }, zelle)).toBe(false);
    expect(tracksSeries({ ...rentItem, amountCents: 60_000 }, zelle)).toBe(false);
    // A card charge with the same amount and day is still never matched without a name in common.
    expect(tracksSeries(rentItem, { ...zelle, transfer: false })).toBe(false);
  });
});

describe("a bill whose amount usually moves (R1)", () => {
  it("is told by its found series, or by its category before the bank shows one", () => {
    for (const category of ["Utilities", " utilities "]) expect(billVaries([], category), category).toBe(true);
    for (const category of ["Phone", "Internet", "Streaming", "Rent", "Insurance", "Housing", "", null, undefined])
      expect(billVaries([], category), String(category)).toBe(false);
    // Once the bank shows the bill, its own charges decide.
    expect(billVaries([found({ variableAmount: false })], "Utilities")).toBe(false);
    expect(billVaries([found({ variableAmount: true })], "Rent")).toBe(true);
  });
});

describe("bill matching helpers", () => {
  it("relates names by equal keys or every word of one inside the other", () => {
    expect(nameRelation(["netflix"], ["netflix", "netflix com ca"])).toBe("same");
    expect(nameRelation(["rent parkview apartments"], ["parkview apartments"])).toBe("contained");
    expect(nameRelation(["parkview rent"], ["parkview apartments"])).toBeNull();
    expect(nameRelation([""], ["parkview apartments"])).toBeNull();
  });

  it("compares amounts in the same direction within 10% (at least 50 cents), 25% when the amount varies", () => {
    expect(amountsClose(-95_000, -95_000, false)).toBe(true);
    expect(amountsClose(-1_000, -1_090, false)).toBe(true);
    expect(amountsClose(-1_000, -1_190, false)).toBe(false);
    expect(amountsClose(-299, -99, false)).toBe(false); // a 99-cent app is not the $2.99 plan
    expect(amountsClose(-299, -320, false)).toBe(true);
    expect(amountsClose(-8_500, -7_000, false)).toBe(false);
    expect(amountsClose(-8_200, -6_906, true)).toBe(true);
    expect(amountsClose(-95_000, 95_000, true)).toBe(false);
  });

  it("measures the gap between two dates on one schedule", () => {
    expect(scheduleGap("2026-12-01", "2027-01-02", "monthly")).toBe(1);
    expect(scheduleGap("2027-01-01", "2026-12-01", "monthly")).toBe(0);
    expect(scheduleGap("2026-12-31", "2027-01-01", "monthly")).toBe(1);
    // A bill on the 31st stays on the 31st after February (audit A15), not the 28th.
    expect(scheduleGap("2026-01-31", "2026-03-31", "monthly")).toBe(0);
    expect(scheduleGap("2026-01-31", "2026-05-31", "monthly")).toBe(0);
    expect(scheduleGap("2026-11-02", "2026-11-17", "weekly")).toBe(1);
  });
});

describe("a bill that already posted is paid for that cycle (A3)", () => {
  // `keys` are the tracked item's own keys plus those of bank series already matched to it.
  const due = (p: Partial<DueOccurrence>): DueOccurrence => ({
    keys: ["city utilities"],
    varies: false,
    frequency: "monthly",
    date: "2026-11-05",
    amountCents: -8_200,
    ...p,
  });
  const charge = (p: Partial<PostedCharge>): PostedCharge => ({
    date: "2026-11-05",
    amountCents: -8_200,
    merchantName: "City Utilities",
    description: "CITY UTILITIES",
    kind: "expense",
    pending: false,
    ...p,
  });
  const paid = (d: DueOccurrence[], c: PostedCharge[]) => [...paidOccurrences(d, c)].sort();

  it("counts a charge for the same merchant on the due date or a few days before", () => {
    expect(paid([due({})], [charge({})])).toEqual([0]);
    expect(paid([due({})], [charge({ date: "2026-11-03" })])).toEqual([0]);
    // A utility whose bank series varies may come in under the tracked amount.
    expect(paid([due({ varies: true })], [charge({ amountCents: -6_906 })])).toEqual([0]);
    expect(paid([due({ varies: false })], [charge({ amountCents: -6_906 })])).toEqual([]);
  });

  it("counts a utility, phone or internet bill under the tracked amount before the bank has its history (R1)", () => {
    // City Utilities, tracked at $82: its first charge is $69.06 today, and no series is found yet.
    expect(paid([due({ varies: billVaries([], "Utilities") })], [charge({ amountCents: -6_906 })])).toEqual([0]);
    expect(paid([due({ varies: billVaries([], "Streaming") })], [charge({ amountCents: -6_906 })])).toEqual([]);
    // Still only under the bill's own keys: a utility with a longer name at that amount isn't this one.
    expect(
      paid([due({ varies: true })], [charge({ merchantName: "City Utilities Water Dept", description: "CITY UTILITIES WATER DEPT", amountCents: -6_906 })]),
    ).toEqual([]);
  });

  it("counts a bank line under another name only through a series already matched to the item", () => {
    const parkview = charge({ merchantName: "Parkview Apartments", description: "PARKVIEW APARTMENTS RENT", amountCents: -95_000 });
    expect(paid([due({ keys: ["rent parkview apartments"], amountCents: -95_000 })], [parkview])).toEqual([]);
    expect(paid([due({ keys: ["rent parkview apartments", "parkview apartments"], amountCents: -95_000 })], [parkview])).toEqual([0]);
  });

  it("never lets an ordinary purchase pay a membership or plan from the same company", () => {
    const amazonPrime = due({ keys: ["amazon prime"], frequency: "monthly", date: "2026-11-10", amountCents: -1_499 });
    expect(paid([amazonPrime], [charge({ date: "2026-11-06", merchantName: "Amazon", description: "AMAZON MKTPL*ZX12", amountCents: -1_380 })])).toEqual([]);
    const uberOne = due({ keys: ["uber one"], date: "2026-11-10", amountCents: -999 });
    expect(paid([uberOne], [charge({ date: "2026-11-07", merchantName: "Uber", description: "UBER *TRIP", amountCents: -1_150 })])).toEqual([]);
    const apple = due({ keys: ["apple"], date: "2026-11-10", amountCents: -299 });
    expect(paid([apple], [charge({ date: "2026-11-07", merchantName: "Apple", description: "APPLE.COM/BILL", amountCents: -99 })])).toEqual([]);
    // An untracked Verizon internet bill doesn't pay the tracked Verizon phone bill.
    const phone = due({ keys: ["verizon"], date: "2026-11-10", amountCents: -8_500 });
    expect(paid([phone], [charge({ date: "2026-11-07", merchantName: "Verizon", description: "VERIZON FIOS", amountCents: -7_000 })])).toEqual([]);
  });

  it("counts rent paid up to 10 days early, not 11", () => {
    const r = due({ keys: ["rent campus edge apts"], date: "2026-12-01", amountCents: -120_000 });
    const rentOn = (date: string) => charge({ date, merchantName: null, description: "RENT CAMPUS EDGE APTS", amountCents: -120_000 });
    expect(paid([r], [rentOn("2026-11-24")])).toEqual([0]);
    expect(paid([r], [rentOn("2026-11-21")])).toEqual([0]);
    expect(paid([r], [rentOn("2026-11-20")])).toEqual([]);
  });

  it("only lets a charge pay the due date it's nearest: every early window is under half the period", () => {
    const period = { weekly: 7, biweekly: 14, monthly: 28, quarterly: 89, yearly: 365 } as const;
    for (const f of Object.keys(period) as (keyof typeof period)[]) expect(PAID_EARLY_DAYS[f]).toBeLessThan(period[f] / 2);
    // A weekly bill counts a charge on the day or the day before only. The day before can't be told apart from last
    // week's bill paid 6 days late; it's nearer this week's due date, so it pays this one.
    const weekly = due({ keys: ["daycare"], frequency: "weekly", date: "2026-11-10", amountCents: -20_000 });
    const daycare = (date: string) => charge({ date, merchantName: "Daycare", description: "DAYCARE", amountCents: -20_000 });
    expect(paid([weekly], [daycare("2026-11-08")])).toEqual([]);
    expect(paid([weekly], [daycare("2026-11-09")])).toEqual([0]);
  });

  it("doesn't count a charge after the due date, still pending, a refund, or another merchant", () => {
    expect(paid([due({})], [charge({ date: "2026-11-06" })])).toEqual([]);
    expect(paid([due({})], [charge({ pending: true })])).toEqual([]);
    expect(paid([due({ amountCents: 8_200 })], [charge({ amountCents: 8_200, kind: "refund" })])).toEqual([]);
    expect(paid([due({})], [charge({ merchantName: "Georgia Power", description: "GEORGIA POWER" })])).toEqual([]);
  });

  it("lets one charge pay one bill, the closest amount first", () => {
    const phone = due({ keys: ["verizon"], varies: true, amountCents: -8_500 });
    const internet = due({ keys: ["verizon"], varies: true, amountCents: -7_000 });
    expect(paid([phone, internet], [charge({ merchantName: "Verizon", description: "VERIZON", amountCents: -7_000 })])).toEqual([1]);
    expect(paid([due({}), due({})], [charge({})])).toEqual([0]);
  });
});

describe("a charge pays the due date it belongs to, never the next one (R2)", () => {
  const netflix = (p: Partial<DueOccurrence>): DueOccurrence => ({
    keys: ["netflix"],
    varies: false,
    frequency: "monthly",
    date: "2026-11-15",
    amountCents: -1_549,
    ...p,
  });
  const nf = (date: string, p: Partial<PostedCharge> = {}): PostedCharge => ({
    date,
    amountCents: -1_549,
    merchantName: "Netflix",
    description: "NETFLIX.COM",
    kind: "expense",
    pending: false,
    ...p,
  });
  const paid = (d: DueOccurrence[], c: PostedCharge[]) => [...paidOccurrences(d, c)].sort();

  it("two $15.49 Netflix plans, one tracked: the other plan's charge a week before the due date doesn't pay it", () => {
    // Last month both plans billed (the 7th and the 15th) and the 15th paid the tracked one: Nov 7 is the other plan again.
    expect(paid([netflix({})], [nf("2026-10-07"), nf("2026-10-15"), nf("2026-11-07")])).toEqual([]);
    // The tracked plan's own charge still pays it.
    expect(paid([netflix({})], [nf("2026-10-07"), nf("2026-10-15"), nf("2026-11-07"), nf("2026-11-15")])).toEqual([0]);
    // With no earlier cycle to tell them apart, a charge 8 days early still pays it, as before.
    expect(paid([netflix({})], [nf("2026-11-07")])).toEqual([0]);
  });

  it("never lets a charge of another found series pay it", () => {
    const tracked = netflix({ series: ["netflix~d15"] });
    expect(paid([tracked], [nf("2026-11-07", { series: "netflix~d7" })])).toEqual([]);
    expect(paid([tracked], [nf("2026-11-13", { series: "netflix~d15" })])).toEqual([0]);
    expect(paid([tracked], [nf("2026-11-13")])).toEqual([0]);
  });

  it("pays the due date it's nearest, even one just before the range, so it can't pay the next bill too", () => {
    // Both plans tracked; the one due Nov 7 is already past when this is read on Nov 8.
    expect(paid([netflix({ date: "2026-11-07" }), netflix({})], [nf("2026-11-07")])).toEqual([0]);
  });

  it("still counts a bill paid early every cycle, and this cycle's charge after a double charge last cycle", () => {
    const rent = (date: string) => nf(date, { merchantName: null, description: "RENT CAMPUS EDGE APTS", amountCents: -120_000 });
    const due1 = netflix({ keys: ["rent campus edge apts"], date: "2026-12-01", amountCents: -120_000 });
    expect(paid([due1], [rent("2026-09-24"), rent("2026-10-24"), rent("2026-11-24")])).toEqual([0]);
    expect(paid([netflix({})], [nf("2026-10-15"), nf("2026-10-15"), nf("2026-11-15")])).toEqual([0]);
    expect(paid([netflix({})], [nf("2026-10-14"), nf("2026-10-15"), nf("2026-11-14")])).toEqual([0]);
  });

  it("a bill due the 31st is still itself in a short month: the cycle back is Jan 31, not Jan 28", () => {
    const feb = netflix({ date: "2026-02-28", day: 31 });
    // Another plan billed Jan 19; this plan Jan 29 and now Feb 26 (two days early both times).
    expect(paid([feb], [nf("2026-01-19"), nf("2026-01-29"), nf("2026-02-26")])).toEqual([0]);
  });

  it("a charge is placed a cycle back by its days before the due date, not by its own date (months differ in length)", () => {
    // Paid Jan 31 and Feb 26 for Feb 28; another plan billed Jan 24 and Feb 25 doesn't make Feb 26 "its next cycle".
    expect(paid([netflix({ date: "2026-02-28", day: 31 })], [nf("2026-01-24"), nf("2026-01-31"), nf("2026-02-25"), nf("2026-02-26")])).toEqual([0]);
  });

  it("a second plan billed just after the due date can't be taken for the previous cycle's early payment", () => {
    // Tracked Mar 25; the other plan billed Feb 26 (after the tracked plan's Feb 25 due date).
    const mar = netflix({ date: "2026-03-25", day: 25 });
    expect(paid([mar], [nf("2026-01-25"), nf("2026-02-23"), nf("2026-02-26"), nf("2026-03-25")])).toEqual([0]);
  });

  it("quarterly and yearly: the other plan's charge doesn't pay, the bill's own does", () => {
    for (const [frequency, later] of [
      ["quarterly", ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]],
      ["yearly", ["2023-07-15", "2024-07-15", "2025-07-15", "2026-07-15"]],
    ] as const) {
      const other = (d: string) => nf(`${d.slice(0, 8)}05`);
      const history = later.slice(0, 3).flatMap((d) => [nf(d), other(d)]);
      const due = netflix({ frequency, date: later[3] });
      expect(paid([due], [...history, other(later[3])])).toEqual([]);
      expect(paid([due], [...history, other(later[3]), nf(later[3])])).toEqual([0]);
    }
  });

  it("a refund or a charge of the opposite direction never pays, and a bill whose amount moves is paid by its own merchant's charge", () => {
    expect(paid([netflix({})], [nf("2026-11-14", { kind: "refund" }), nf("2026-11-14", { amountCents: 1_549 })])).toEqual([]);
    const power = netflix({ keys: ["georgia power"], varies: true, amountCents: -10_000 });
    const bill = (date: string, amountCents: number) => nf(date, { merchantName: "Georgia Power", description: "GEORGIA POWER", amountCents });
    expect(paid([power], [bill("2026-11-12", -11_900)])).toEqual([0]);
    expect(paid([power], [bill("2026-11-12", -13_000)])).toEqual([]);
    expect(paid([power], [nf("2026-11-12", { amountCents: -10_000 })])).toEqual([]);
  });

  it("a phone or internet bill with no series is not paid by the same brand's other product (F1)", () => {
    const store = nf("2026-11-14", { merchantName: null, description: "VERIZON STORE #1234", amountCents: -6_999 });
    const verizon = netflix({ keys: ["verizon"], amountCents: -8_500, date: "2026-11-20", varies: billVaries([], "Phone") });
    expect(paid([verizon], [store])).toEqual([]);
    const att = netflix({ keys: ["at t"], amountCents: -8_000, date: "2026-11-10", varies: billVaries([], "Internet") });
    expect(paid([att], [nf("2026-11-03", { merchantName: null, description: "AT&T UVERSE", amountCents: -6_500 })])).toEqual([]);
    // Within the usual 10% it is still paid.
    expect(paid([verizon], [nf("2026-11-14", { merchantName: null, description: "VERIZON WIRELESS", amountCents: -8_200 })])).toEqual([0]);
  });

  it("a refunded and re-charged previous cycle, or a varying bill paid in two parts, doesn't hide this cycle's payment (F3)", () => {
    // Nov 9 charge refunded the next day, re-charged Nov 12: the Nov 9 one was never a second plan.
    const refund = nf("2026-11-10", { kind: "refund", amountCents: 1_549 });
    expect(paid([netflix({ date: "2026-12-15" })], [nf("2026-11-09"), refund, nf("2026-11-12"), nf("2026-12-09")])).toEqual([0]);
    const reimbursed = nf("2026-11-14", { kind: "reimbursement", amountCents: 1_549 });
    expect(paid([netflix({ date: "2026-12-15" })], [nf("2026-11-09"), reimbursed, nf("2026-11-12"), nf("2026-12-09")])).toEqual([0]);
    // A varying bill paid $70 and $75 last cycle, $85 this cycle: the parts are one bill's, not another plan's.
    const gp = (date: string, amountCents: number) => nf(date, { merchantName: "Georgia Power", description: "GEORGIA POWER", amountCents });
    const power = netflix({ keys: ["georgia power"], varies: true, amountCents: -8_200 });
    expect(paid([power], [gp("2026-10-06", -7_000), gp("2026-10-15", -7_500), gp("2026-11-06", -8_500)])).toEqual([0]);
    // A small credit (a $2 promo) doesn't undo the other plan's charge, so that plan is still told apart (review P11).
    const credit = nf("2026-10-09", { kind: "refund", amountCents: 200 });
    expect(paid([netflix({ date: "2026-11-15" })], [nf("2026-10-07"), credit, nf("2026-10-15"), nf("2026-11-07")])).toEqual([]);
    // The other plan is still told apart when nothing was refunded.
    expect(paid([netflix({})], [nf("2026-10-07"), nf("2026-10-15"), nf("2026-11-07")])).toEqual([]);
  });
});
