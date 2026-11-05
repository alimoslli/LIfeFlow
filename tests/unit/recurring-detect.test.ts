import { describe, expect, it } from "vitest";
import { detectRecurring, nextOccurrence, nthOccurrence, occurrencesBetween, type DetectTxn } from "@/server/services/finance/recurring-detect";

/**
 * Recurring charges real people pay (audit 2026-11-05, A4 to A7, A15, A16). The cases are the auditor's
 * (recurring-audit.ts, dup-audit.ts) plus the own-account transfers that must stay out.
 */
const tx = (date: string, amountCents: number, merchantName: string | null, description: string, extra: Partial<DetectTxn> = {}): DetectTxn => ({
  date,
  amountCents,
  merchantName,
  description,
  kind: "expense",
  categoryName: null,
  ...extra,
});
const months = (start: string, n: number) => Array.from({ length: n }, (_, i) => nthOccurrence(start, "monthly", i));
const every = (start: string, days: number, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * days * 86_400_000).toISOString().slice(0, 10));
const transfer = (extra: Partial<DetectTxn> = {}): Partial<DetectTxn> => ({ kind: "transfer", ...extra });

describe("month-end bills keep their day (A15)", () => {
  it("projects monthly from Jan 31 as Feb 28, Mar 31, Apr 30", () => {
    expect([1, 2, 3].map((n) => nthOccurrence("2026-01-31", "monthly", n))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-05-31")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(occurrencesBetween("2026-01-30", "quarterly", "2026-01-01", "2026-12-31")).toEqual(["2026-01-30", "2026-04-30", "2026-07-30", "2026-10-30"]);
    expect(occurrencesBetween("2024-02-29", "yearly", "2025-01-01", "2028-12-31")).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    // A stale start far in the past still lands on the schedule.
    expect(occurrencesBetween("2020-03-02", "weekly", "2026-11-01", "2026-11-10")).toEqual(["2026-11-02", "2026-11-09"]);
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("expects a bill found on the 31st on the 31st again, even when its last charge was a short month's end", () => {
    const comcast = (dates: string[]) => detectRecurring(dates.map((d) => tx(d, -4500, "Comcast", "COMCAST")))[0];
    expect(comcast(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])).toMatchObject({ nextExpectedDate: "2026-05-31", dueDay: 31 });
    expect(comcast(["2025-12-31", "2026-01-31", "2026-02-28"])).toMatchObject({ nextExpectedDate: "2026-03-31", dueDay: 31 });
    expect(comcast(["2026-01-15", "2026-02-15", "2026-03-15"])).toMatchObject({ nextExpectedDate: "2026-04-15", dueDay: 15 });
  });
});

describe("bills paid by transfer (A4)", () => {
  it("finds a car loan paid as a Plaid loan payment", () => {
    const r = detectRecurring(months("2026-07-10", 4).map((d) => tx(d, -38_900, null, "GRANITE FCU AUTO LOAN PMT", transfer())));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "bill", frequency: "monthly", latestAmountCents: -38_900, nextExpectedDate: "2026-11-10" });
  });

  it("finds rent sent to a roommate by Zelle", () => {
    const r = detectRecurring(months("2026-07-01", 4).map((d, i) => tx(d, -60_000, null, `ZELLE TO JORDAN M CONF# ${i}7Q${i}X`, transfer())));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "bill", frequency: "monthly", latestAmountCents: -60_000, name: "Zelle To Jordan M" });
  });

  it("finds a 529 contribution after two months, like a known subscription", () => {
    const r = detectRecurring(
      ["2025-11-17", "2025-12-15"].map((d) => tx(d, -25_000, null, "STATE 529 PLAN CONTRIB", transfer({ categoryName: "Investment Transfer" }))),
    );
    expect(r).toMatchObject([{ kind: "bill", frequency: "monthly", latestAmountCents: -25_000 }]);
  });

  it("finds Venmo rent among Venmo payments of every size, and nothing in the random ones", () => {
    const random = every("2026-06-04", 9, 14).map((d, i) => tx(d, -(1_500 + ((i * 1_337) % 4_500)), "Venmo", `VENMO PAYMENT 10293847${i}`, transfer()));
    expect(detectRecurring(random)).toEqual([]);
    const rent = months("2026-06-01", 5).map((d) => tx(d, -60_000, "Venmo", "VENMO PAYMENT 5550001234", transfer()));
    expect(detectRecurring([...random, ...rent])).toMatchObject([{ kind: "bill", frequency: "monthly", latestAmountCents: -60_000 }]);
  });

  it("still counts a loan payment as a bill when the loan's own account is linked", () => {
    const pay = months("2026-07-12", 4).flatMap((d) => [
      tx(d, -38_900, null, "ONLINE PMT TO 8812", transfer({ accountId: "chk", accountType: "depository" })),
      tx(d, 38_900, null, "PAYMENT THANK YOU", transfer({ accountId: "auto", accountType: "loan" })),
    ]);
    expect(detectRecurring(pay)).toMatchObject([{ kind: "bill", latestAmountCents: -38_900 }]);
  });

  it("leaves out money moved between the person's own accounts", () => {
    const own = [
      // Savings, by Plaid's category and by the statement line.
      ...every("2026-08-14", 14, 6).map((d) => tx(d, -4_000, null, "ONLINE TRANSFER TO SAVINGS XXXXXX4410", transfer({ categoryName: "Savings Transfer" }))),
      ...months("2026-06-03", 5).map((d) => tx(d, -110_000, null, "ONLINE TRANSFER TO SAV XXXXXX2291", transfer())),
      // Paying their own credit card.
      ...months("2026-06-17", 5).map((d) => tx(d, -16_200, null, "LAKESIDE CU VISA PMT AUTOPAY", transfer({ categoryName: "Credit Card Payment" }))),
      ...months("2026-06-19", 5).map((d) => tx(d, -5_000, null, "GRANITE FCU VISA PAYMENT", transfer())),
      // Checking to checking, seen on both sides.
      ...months("2026-06-05", 5).flatMap((d) => [
        tx(d, -50_000, null, "MOBILE TRANSFER 8812", transfer({ accountId: "chk-1", accountType: "depository" })),
        tx(d, 50_000, null, "MOBILE TRANSFER 8812", transfer({ accountId: "chk-2", accountType: "depository" })),
      ]),
      // A line naming another of their accounts by its last 4 digits.
      tx("2026-08-01", 1, null, "seed", { accountId: "chk-3", accountType: "depository", accountMask: "7731" }),
      ...months("2026-06-09", 5).map((d) => tx(d, -20_000, null, "ONLINE XFER XXXX7731", transfer({ accountId: "chk-1", accountMask: "4821" }))),
      // Cash.
      ...every("2026-08-07", 7, 8).map((d) => tx(d, -10_000, null, "ATM WITHDRAWAL 1234 MAIN ST", transfer())),
      // Money coming in by transfer is never a bill.
      ...months("2026-06-01", 5).map((d) => tx(d, 30_000, null, "ONLINE TRANSFER FROM SAVINGS", transfer())),
    ];
    expect(detectRecurring(own)).toEqual([]);
  });
});

describe("two subscriptions from one merchant (A5)", () => {
  const icloud = months("2026-07-03", 4).map((d) => tx(d, -299, "Apple", "APPLE.COM/BILL"));
  const music = months("2026-07-20", 4).map((d) => tx(d, -1_099, "Apple", "APPLE.COM/BILL"));

  it("finds iCloud on the 3rd and Apple Music on the 20th as two series, and a one-off App Store purchase as neither", () => {
    const r = detectRecurring([...icloud, ...music, tx("2026-08-11", -499, "Apple", "APPLE.COM/BILL")]);
    expect(r.map((c) => [c.kind, c.frequency, c.latestAmountCents, c.lastDate, c.nextExpectedDate]).sort()).toEqual([
      ["subscription", "monthly", -1_099, "2026-10-20", "2026-11-20"],
      ["subscription", "monthly", -299, "2026-10-03", "2026-11-03"],
    ]);
    expect(new Set(r.map((c) => c.seriesKey))).toEqual(new Set(["apple", "apple~2"]));
    expect(r.every((c) => c.merchantKey === "apple" && c.confidence >= 0.6)).toBe(true);
  });

  it("splits two same-price subscriptions billed on different days", () => {
    const a = months("2026-06-03", 5).map((d) => tx(d, -999, "Apple", "APPLE.COM/BILL"));
    const b = months("2026-06-20", 5).map((d) => tx(d, -999, "Apple", "APPLE.COM/BILL"));
    const r = detectRecurring([...a, ...b]);
    expect(r.map((c) => [c.frequency, c.nextExpectedDate]).sort()).toEqual([
      ["monthly", "2026-11-03"],
      ["monthly", "2026-11-20"],
    ]);
  });

  it("keeps a real every-two-weeks charge as one series", () => {
    const r = detectRecurring(every("2026-06-05", 14, 8).map((d) => tx(d, -2_500, "Crunch Fitness", "CRUNCH FITNESS")));
    expect(r).toMatchObject([{ frequency: "biweekly", occurrences: 8 }]);
  });

  it("follows a price change inside one of them", () => {
    const up = [...months("2026-07-03", 3).map((d) => tx(d, -299, "Apple", "APPLE.COM/BILL")), tx("2026-10-03", -399, "Apple", "APPLE.COM/BILL")];
    const r = detectRecurring([...up, ...music]);
    const cloud = r.find((c) => c.charges[0].amountCents === -299)!;
    expect(cloud).toMatchObject({ latestAmountCents: -399, occurrences: 4, priceChange: { fromCents: -299, toCents: -399, date: "2026-10-03" } });
    expect(r).toHaveLength(2);
  });

  it("doesn't make a subscription out of two same-price App Store purchases a month apart", () => {
    const r = detectRecurring([...icloud, tx("2026-08-09", -99, "Apple", "APPLE.COM/BILL"), tx("2026-09-08", -99, "Apple", "APPLE.COM/BILL")]);
    expect(r.map((c) => c.latestAmountCents)).toEqual([-299]);
  });
});

describe("a price change keeps the subscription (A6)", () => {
  it("reports Netflix at $15.49 twice, then $17.99, on the first changed charge", () => {
    const r = detectRecurring([
      ...months("2026-08-09", 2).map((d) => tx(d, -1_549, "Netflix", "NETFLIX.COM")),
      tx("2026-10-09", -1_799, "Netflix", "NETFLIX.COM"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(r[0]).toMatchObject({ kind: "subscription", latestAmountCents: -1_799, priceChange: { fromCents: -1_549, toCents: -1_799, date: "2026-10-09" } });
  });

  it("reports the latest change only, and none for a steady price or a bill whose amount moves", () => {
    const spotify = [
      ...months("2026-04-15", 3).map((d) => tx(d, -1_099, "Spotify", "Spotify USA")),
      ...months("2026-07-15", 4).map((d) => tx(d, -1_199, "Spotify", "Spotify USA")),
    ];
    expect(detectRecurring(spotify)[0].priceChange).toEqual({ fromCents: -1_099, toCents: -1_199, date: "2026-07-15" });
    expect(detectRecurring(months("2026-07-15", 4).map((d) => tx(d, -1_199, "Spotify", "Spotify USA")))[0].priceChange).toBeNull();
    const power = [9_100, 7_000, 7_000, 8_800].map((c, i) =>
      tx(months("2026-07-09", 4)[i], -c, "Georgia Power", "GEORGIA POWER", { categoryName: "Utilities" }),
    );
    expect(detectRecurring(power)[0]).toMatchObject({ kind: "bill", priceChange: null });
  });
});

describe("a double charge on a long-running subscription (A7)", () => {
  const spotify = (dates: string[]) => dates.map((d) => tx(d, -1_199, "Spotify", "Spotify USA"));

  it("reports a same-day or next-day second charge, and the schedule stays on the 15th", () => {
    const same = detectRecurring(spotify([...months("2026-07-15", 4), "2026-10-15"]))[0];
    expect(same).toMatchObject({ occurrences: 4, nextExpectedDate: "2026-11-15", duplicates: [{ dates: ["2026-10-15", "2026-10-15"], amountCents: -1_199 }] });
    const next = detectRecurring(spotify([...months("2026-07-15", 4), "2026-10-16"]))[0];
    expect(next).toMatchObject({ occurrences: 4, nextExpectedDate: "2026-11-15", duplicates: [{ dates: ["2026-10-15", "2026-10-16"], amountCents: -1_199 }] });
  });

  it("doesn't call two identical subscriptions billed together every month a double charge", () => {
    const twice = months("2026-06-15", 5).flatMap((d) => spotify([d, d]));
    expect(detectRecurring(twice)[0].duplicates).toEqual([]);
  });
});

describe("only real bills are offered (A16)", () => {
  it("never finds a coffee shop visited weekly at changing prices", () => {
    const grind = ["2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21"].map((d, i) =>
      tx(d, -[642, 468, 530, 511, 674][i], "Daily Grind", "DAILY GRIND", { categoryName: "Coffee" }),
    );
    expect(detectRecurring(grind)).toEqual([]);
    const irregular = ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-09", "2026-09-15", "2026-09-22", "2026-09-23", "2026-09-29"].map((d, i) =>
      tx(d, -(450 + (i % 3) * 75), "Starbucks", "STARBUCKS #1234"),
    );
    expect(detectRecurring(irregular)).toEqual([]);
  });

  it("finds a fixed-price meal kit or coffee club as a subscription, never a bill", () => {
    const kit = every("2026-09-01", 7, 6).map((d) => tx(d, -6_999, "HelloFresh", "HELLOFRESH", { categoryName: "Groceries" }));
    expect(detectRecurring(kit)).toMatchObject([{ kind: "subscription", frequency: "weekly" }]);
    const club = months("2026-07-02", 4).map((d) => tx(d, -15_000, "Panera Bread", "PANERA UNLIMITED SIP CLUB", { categoryName: "Coffee" }));
    expect(detectRecurring(club)).toMatchObject([{ kind: "subscription", frequency: "monthly" }]);
  });

  it("finds DashPass among DoorDash orders", () => {
    const orders = every("2026-06-02", 6, 25).map((d, i) =>
      tx(d, -(1_850 + ((i * 731) % 2_400)), "DoorDash", "DOORDASH*ORDER", { categoryName: "Food Delivery" }),
    );
    const pass = months("2026-06-11", 5).map((d) => tx(d, -999, "DoorDash", "DOORDASH DASHPASS", { categoryName: "Food Delivery" }));
    expect(detectRecurring([...orders, ...pass])).toMatchObject([{ kind: "subscription", frequency: "monthly", latestAmountCents: -999 }]);
  });
});
