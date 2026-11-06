import { describe, expect, it } from "vitest";
import { addDaysStr } from "@/lib/dates";
import {
  detectRecurring,
  merchantKey,
  nextOccurrence,
  nthOccurrence,
  occurrencesBetween,
  storedKeyForms,
  type DetectTxn,
} from "@/server/services/finance/recurring-detect";

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
    expect(r[0]).toMatchObject({ kind: "bill", frequency: "monthly", latestAmountCents: -60_000, name: "Zelle to Jordan M" });
  });

  it("finds a 529 contribution after two months, like a known subscription", () => {
    const r = detectRecurring(
      ["2025-11-17", "2025-12-15"].map((d) => tx(d, -25_000, null, "STATE 529 PLAN CONTRIB", transfer({ categoryName: "Investment Transfer" }))),
    );
    expect(r).toMatchObject([{ kind: "bill", frequency: "monthly", latestAmountCents: -25_000 }]);
  });

  it("finds Venmo rent among Venmo payments of every size, and nothing in the random ones", () => {
    // Friends' payments: every 2 to 14 days, $6 to $60 (seeded, so the test never changes).
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const random: DetectTxn[] = [];
    for (let d = "2026-06-04"; d <= "2026-10-31"; d = addDaysStr(d, 2 + Math.floor(rnd() * 13)))
      random.push(tx(d, -(600 + Math.floor(rnd() * 5_400)), "Venmo", `VENMO PAYMENT 10293847${random.length}`, transfer()));
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

  it("needs evidence to call a transfer a bill: savings banks, brokerages, card issuers and app top-ups are the person's own money", () => {
    // Plaid files these as plain transfers, or Vanguard and Fidelity as investment transfers (reviewer's cases).
    const own = [
      ["ALLY BANK TRANSFER", null],
      ["ONLINE TRANSFER TO ALLY BANK", null],
      ["MARCUS GOLDMAN SACHS DES:TRANSFER", null],
      ["CAPITAL ONE 360 DES:TRANSFER", null],
      ["SOFI BANK DES:TRANSFER", null],
      ["WEALTHFRONT EDI PYMNTS", null],
      ["ROBINHOOD DES:FUNDS", null],
      ["VANGUARD BUY INVESTMENT", "Investment Transfer"],
      ["FIDELITY MONEYLINE", "Investment Transfer"],
      ["VENMO ADD FUNDS", null],
      ["PAYPAL INST XFER", null],
      ["CASH APP*CASH OUT", null],
      ["CITI AUTOPAY PAYMENT 230510", null],
      ["CAPITAL ONE MOBILE PYMT", null],
      ["APPLECARD GSBANK PAYMENT", null],
      ["BARCLAYCARD US EPAY", null],
      ["SYNCHRONY BANK PAYMENT", null],
      ["ONLINE PAYMENT 5521", null],
    ] as const;
    for (const [line, categoryName] of own)
      expect([line, detectRecurring(months("2026-05-03", 6).map((d) => tx(d, -20_000, null, line, transfer({ categoryName }))))]).toEqual([line, []]);
    const bills = ["TOYOTA FINANCIAL PMT", "DEPT EDUCATION STUDENT LN", "ZELLE TO ROOMMATE CONF# 8KQ2", "SOFI STUDENT LOAN PMT", "ALLY AUTO PAYMENT"];
    for (const line of bills)
      expect([line, detectRecurring(months("2026-05-03", 6).map((d) => tx(d, -38_900, null, line, transfer()))).map((c) => c.kind)]).toEqual([line, ["bill"]]);
  });

  it("never offers bank fees, however regular", () => {
    const fees = every("2026-05-04", 14, 12).map((d) => tx(d, -2_500, null, "OVERDRAFT FEE"));
    const service = months("2026-05-01", 6).map((d) => tx(d, -1_200, null, "MONTHLY SERVICE FEE", { categoryName: "Fees & Interest" }));
    expect(detectRecurring([...fees, ...service])).toEqual([]);
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
    expect(new Set(r.map((c) => c.seriesKey))).toEqual(new Set(["apple~d3", "apple~d20"]));
    expect(r.every((c) => c.merchantKey === "apple" && c.confidence >= 0.6)).toBe(true);
  });

  it("keys each series by its own day and price, so a key doesn't move when another series starts or stops (review 8)", () => {
    const keys = (txns: DetectTxn[]) =>
      detectRecurring(txns, { today: "2026-11-05" })
        .map((c) => c.seriesKey)
        .sort();
    expect(keys([...icloud, ...music])).toEqual(["apple~d20", "apple~d3"]);
    // Apple Arcade starts in September on the 9th: iCloud and Apple Music keep their keys.
    const arcade = months("2026-08-09", 3).map((d) => tx(d, -699, "Apple", "APPLE.COM/BILL"));
    expect(keys([...icloud, ...music, ...arcade])).toEqual(["apple~d20", "apple~d3", "apple~d9"]);
    // Two on the same day are told apart by price.
    const tv = months("2026-07-03", 4).map((d) => tx(d, -999, "Apple", "APPLE.COM/BILL"));
    expect(keys([...icloud, ...tv])).toEqual(["apple~d3-299", "apple~d3-999"]);
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
  it("reports Netflix at $15.49 twice, then $17.99, on the first changed charge (trusted 3 days after its due date)", () => {
    const charges = [...months("2026-08-09", 2).map((d) => tx(d, -1_549, "Netflix", "NETFLIX.COM")), tx("2026-10-09", -1_799, "Netflix", "NETFLIX.COM")];
    // The day it posts, it could still be something else bought there: the series goes on at $15.49 for now.
    expect(detectRecurring(charges, { today: "2026-10-09" })).toMatchObject([{ latestAmountCents: -1_549, priceChange: null }]);
    const r = detectRecurring(charges, { today: "2026-10-12" });
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

  it("calls a pair billed together every cycle two items, not a double charge", () => {
    const twice = months("2026-06-15", 5).flatMap((d) => spotify([d, d]));
    expect(detectRecurring(twice).map((c) => [c.occurrences, c.duplicates])).toEqual([
      [5, []],
      [5, []],
    ]);
    // Two iCloud plans a day apart, and a class on Mondays and Wednesdays at the same price.
    const icloud = [...months("2025-11-14", 12), ...months("2025-11-15", 12)].map((d) => tx(d, -299, "Apple", "APPLE.COM/BILL"));
    expect(
      detectRecurring(icloud)
        .map((c) => [c.frequency, c.occurrences, c.dueDay])
        .sort(),
    ).toEqual([
      ["monthly", 12, 14],
      ["monthly", 12, 15],
    ]);
    const classes = [...every("2026-08-03", 7, 12), ...every("2026-08-05", 7, 12)].map((d) =>
      tx(d, -1_500, null, "SQ *YOGA LOFT", { categoryName: "Fitness" }),
    );
    expect(detectRecurring(classes).map((c) => [c.frequency, c.occurrences, c.latestAmountCents])).toEqual([
      ["weekly", 12, -1_500],
      ["weekly", 12, -1_500],
    ]);
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

describe("only series still billing, and the charges that make them (review 2, 5)", () => {
  it("drops a subscription that missed its last charge, and counts this month's charge while it's pending", () => {
    const gym = months("2026-04-12", 4).map((d) => tx(d, -2_499, "Crunch Fitness", "CRUNCH FITNESS"));
    expect(detectRecurring(gym, { today: "2026-08-15" })).toHaveLength(1); // due Aug 12, 3 days late: still billing
    expect(detectRecurring(gym, { today: "2026-08-25" })).toEqual([]); // 13 days past its Aug 12 charge: stopped
    const pass = [...months("2026-09-08", 2), "2026-11-05"].map((d, i) =>
      tx(d, -3_000, null, "METRO TRANSIT PASS AUTOLOAD", { categoryName: "Public Transit", pending: i === 2 }),
    );
    expect(detectRecurring(pass)).toMatchObject([{ occurrences: 3, lastDate: "2026-11-05" }]);
    // A pending copy of a charge that already posted isn't a second charge.
    const copy = [
      ...months("2026-07-15", 4).map((d) => tx(d, -1_549, "Netflix", "NETFLIX.COM")),
      tx("2026-10-14", -1_549, "Netflix", "NETFLIX.COM", { pending: true }),
    ];
    expect(detectRecurring(copy)).toMatchObject([{ occurrences: 4, duplicates: [] }]);
  });

  it("needs 4 quarterly charges picked out of other purchases, and keeps iCloud through a same-price App Store purchase", () => {
    const quarterly = ["2025-11-18", "2026-02-17", "2026-05-18", "2026-08-17"];
    const noise = every("2025-10-03", 5, 80).map((d, i) => tx(d, -(700 + ((i * 7_919) % 6_000)), "Amazon", "AMZN Mktp US"));
    expect(detectRecurring([...noise, ...quarterly.slice(1).map((d) => tx(d, -4_851, "Amazon", "AMZN Mktp US"))], { today: "2026-11-05" })).toEqual([]);
    expect(detectRecurring([...noise, ...quarterly.map((d) => tx(d, -4_851, "Amazon", "AMZN Mktp US"))], { today: "2026-11-05" })).toHaveLength(1);
    const icloud = months("2025-10-24", 13).map((d) => tx(d, -299, "Apple", "APPLE.COM/BILL"));
    const apps = every("2025-10-14", 6, 65).map((d, i) => tx(d, -(150 + ((i * 131) % 500)), "Apple", "APPLE.COM/BILL"));
    const r = detectRecurring([...icloud, ...apps, tx("2025-10-14", -299, "Apple", "APPLE.COM/BILL")], { today: "2026-11-05" });
    expect(r.filter((c) => c.latestAmountCents === -299)).toMatchObject([{ occurrences: 13, frequency: "monthly" }]);
  });

  it("finds a utilities share by Venmo that moves each month, among smaller payments to friends", () => {
    const friends = [
      "2026-07-19",
      "2026-07-21",
      "2026-07-27",
      "2026-08-02",
      "2026-08-16",
      "2026-08-21",
      "2026-09-07",
      "2026-09-22",
      "2026-09-26",
      "2026-10-05",
      "2026-10-30",
    ].map((d, i) => tx(d, -[483, 709, 448, 367, 249, 502, 484, 193, 776, 330, 2_210][i], "Venmo", `VENMO PAYMENT 63055${i}`, transfer()));
    const share = ["2026-07-14", "2026-08-14", "2026-09-14", "2026-10-14"].map((d, i) =>
      tx(d, -[5_290, 4_322, 5_729, 4_870][i], null, `VENMO PAYMENT 31985${i}`, transfer()),
    );
    expect(detectRecurring([...friends, ...share])).toMatchObject([{ kind: "bill", frequency: "monthly", latestAmountCents: -4_870, occurrences: 4 }]);
  });

  it("doesn't call a class paid per visit a weekly subscription after 3 visits", () => {
    const visits = ["2026-10-13", "2026-10-19", "2026-10-26"].map((d, i) =>
      tx(d, -[1_283, 1_482, 1_360][i], null, "SQ *LITTLE GYM CLASS", { categoryName: "Fitness" }),
    );
    expect(detectRecurring(visits)).toEqual([]);
  });
});

describe("held-out people (review follow-up)", () => {
  it("never offers money from family by Zelle as recurring income", () => {
    const family = months("2026-07-08", 4).map((d) =>
      tx(d, 34_897, null, "ZELLE FROM PARENT A4KQ CONF# 8XQ2", { kind: "income", categoryName: "Side Income" }),
    );
    expect(detectRecurring(family)).toEqual([]);
  });

  it("doesn't let two same-price purchases two weeks apart swallow iCloud as a 'price change'", () => {
    const apple = (date: string, cents: number, pending = false) => tx(date, -cents, "Apple", "APPLE.COM/BILL", { pending });
    const r = detectRecurring([
      apple("2026-08-10", 357),
      apple("2026-08-18", 832),
      apple("2026-08-24", 604),
      apple("2026-08-24", 357),
      apple("2026-09-08", 299),
      apple("2026-09-25", 739),
      apple("2026-10-06", 299),
      apple("2026-10-26", 880),
      apple("2026-11-02", 921),
      apple("2026-11-05", 299, true),
    ]);
    expect(r.map((c) => [c.latestAmountCents, c.charges.map((x) => x.date)])).toEqual([[-299, ["2026-09-08", "2026-10-06", "2026-11-05"]]]);
  });

  it("doesn't call two Amazon orders and a dearer third a subscription with a price change", () => {
    const orders = every("2026-06-02", 4, 40).map((d, i) => tx(d, -(1_000 + ((i * 3_571) % 7_000)), "Amazon", "AMZN Mktp US"));
    const r = detectRecurring(
      [
        ...orders,
        tx("2026-08-26", -560, "Amazon", "AMZN Mktp US"),
        tx("2026-09-28", -560, "Amazon", "AMZN Mktp US"),
        tx("2026-10-30", -677, "Amazon", "AMZN Mktp US"),
      ],
      {
        today: "2026-11-05",
      },
    );
    expect(r).toEqual([]);
  });
});

describe("a new price is provisional until its cycle has passed (review follow-up 1)", () => {
  const A = { merchantName: "Apple", categoryName: "Software" };
  const apple = (date: string, cents: number) => tx(date, -cents, "Apple", "APPLE.COM/BILL", A);
  const icloud = months("2026-01-11", 10).map((d) => apple(d, 299));
  const latest = (txns: DetectTxn[], today: string) => detectRecurring(txns, { today }).map((c) => [c.latestAmountCents, c.priceChange]);

  it("doesn't call a $3.99 App Store purchase two days before iCloud's $2.99 charge a price rise", () => {
    const app = apple("2026-11-09", 399);
    expect(latest([...icloud, app], "2026-11-09")).toEqual([[-299, null]]);
    expect(latest([...icloud, app], "2026-11-10")).toEqual([[-299, null]]);
    // iCloud posts as usual: the purchase was a one-off.
    expect(latest([...icloud, app, apple("2026-11-11", 299)], "2026-11-11")).toEqual([[-299, null]]);
    expect(latest([...icloud, app, apple("2026-11-11", 299)], "2026-12-01")).toEqual([[-299, null]]);
  });

  it("still catches a real rise on its first charge, confirmed once the due window has passed", () => {
    const rise = apple("2026-11-11", 399);
    expect(latest([...icloud, rise], "2026-11-12")).toEqual([[-299, null]]);
    expect(latest([...icloud, rise], "2026-11-14")).toEqual([[-399, { fromCents: -299, toCents: -399, date: "2026-11-11" }]]);
  });

  it("never lets an app purchase take over iCloud when its real rise comes days later (person h3323)", () => {
    const history = [
      "2025-10-14",
      "2025-11-12",
      "2025-12-11",
      "2026-01-12",
      "2026-02-11",
      "2026-03-11",
      "2026-04-13",
      "2026-05-11",
      "2026-06-11",
      "2026-07-13",
      "2026-08-11",
    ];
    // Other App Store purchases all year, none near September's due date.
    const others = every("2025-10-03", 9, 44)
      .map((d, i) => apple(d, 150 + ((i * 97) % 700)))
      .filter((t) => t.date < "2026-09-04" || t.date > "2026-09-18");
    const base = [...history.map((d) => apple(d, 299)), ...others.filter((t) => t.amountCents !== -299 && t.amountCents !== -331 && t.amountCents !== -374)];
    const cloud = (txns: DetectTxn[], today: string) =>
      detectRecurring(txns, { today })
        .filter((c) => c.charges.some((x) => x.date === "2026-08-11"))
        .map((c) => [c.latestAmountCents, c.priceChange]);
    const app = apple("2026-09-08", 331);
    expect(cloud([...base, app], "2026-09-09")).toEqual([[-299, null]]);
    const rise = [apple("2026-09-11", 374), apple("2026-10-13", 374)];
    expect(cloud([...base, app, rise[0]], "2026-09-14")).toEqual([[-374, { fromCents: -299, toCents: -374, date: "2026-09-11" }]]);
    expect(cloud([...base, app, ...rise], "2026-11-05")).toEqual([[-374, { fromCents: -299, toCents: -374, date: "2026-09-11" }]]);
  });
});

describe("two new prices around one due date (review follow-up 1)", () => {
  it("waits for one of them to repeat before calling either a price change", () => {
    const apple = (date: string, cents: number) => tx(date, -cents, "Apple", "APPLE.COM/BILL", { categoryName: "Software" });
    const icloud = months("2026-01-11", 10).map((d) => apple(d, 299));
    const cloud = (txns: DetectTxn[], today: string) => detectRecurring(txns, { today }).map((c) => [c.latestAmountCents, c.priceChange?.toCents ?? null]);
    const both = [apple("2026-11-10", 336), apple("2026-11-11", 374)];
    expect(cloud([...icloud, ...both], "2026-11-20")).toEqual([[-299, null]]);
    // December's charge is $3.74 again: that's the new price, from Nov 11.
    expect(cloud([...icloud, ...both, apple("2026-12-11", 374)], "2026-12-12")).toEqual([[-374, -374]]);
  });
});

describe("series keys don't move with weekends (review follow-up 2)", () => {
  it("keeps one key per series while charges post on the 10th, 11th or 12th", () => {
    // Posted the next business day, as banks do: a charge due on a Saturday posts on Monday.
    const post = (d: string) => {
      const w = new Date(`${d}T00:00:00Z`).getUTCDay();
      return w === 6 ? addDaysStr(d, 2) : w === 0 ? addDaysStr(d, 1) : d;
    };
    const txns = months("2025-10-10", 14).flatMap((d) => [
      tx(post(d), -1_099, "Apple", "APPLE.COM/BILL", { categoryName: "Software" }),
      tx(post(nthOccurrence(d, "monthly", 0, 24)), -299, "Apple", "APPLE.COM/BILL", { categoryName: "Software" }),
    ]);
    const keys = new Set<string>();
    for (let d = "2026-05-01"; d <= "2026-11-05"; d = addDaysStr(d, 1))
      for (const c of detectRecurring(
        txns.filter((t) => t.date <= d),
        { today: d },
      ))
        keys.add(c.seriesKey);
    expect([...keys].sort()).toEqual(["apple~d10", "apple~d24"]);
  });
});

describe("the reviewer's held-out wrong ones (review follow-up, optional)", () => {
  it("doesn't make a bill of three friends' Venmo payments that happen to land a month apart", () => {
    // Person h3025: about six payments in 90 days, $4 to $20; three of the larger fall on the 21st or 22nd.
    const venmo = [
      ["2026-08-10", 1_869],
      ["2026-08-13", 434],
      ["2026-08-21", 2_034],
      ["2026-09-21", 1_770],
      ["2026-10-15", 883],
      ["2026-10-22", 1_407],
    ].map(([d, c]) => tx(d as string, -(c as number), "Venmo", `VENMO PAYMENT 31${c}`, transfer()));
    expect(detectRecurring(venmo, { today: "2026-11-05" })).toEqual([]);
  });

  it("doesn't call a remittance three months apart, or three event tickets a week apart, a series", () => {
    const remit = ["2026-05-04", "2026-08-06", "2026-11-02"].map((d) => tx(d, -3_500, "Remitly", "REMITLY* 8XQ2KD4M", transfer()));
    expect(detectRecurring(remit)).toEqual([]);
    const tickets = ["2026-10-19", "2026-10-27", "2026-11-02"].map((d) => tx(d, -1_452, "Eventbrite", "EVENTBRITE", { categoryName: "Events" }));
    expect(detectRecurring(tickets)).toEqual([]);
    // A fourth on schedule makes it weekly.
    expect(detectRecurring([...tickets, tx("2026-11-09", -1_452, "Eventbrite", "EVENTBRITE", { categoryName: "Events" })])).toMatchObject([
      { frequency: "weekly" },
    ]);
  });
});

describe("rent paid to a person every week or two (review follow-up)", () => {
  it("finds biweekly rent by Zelle and weekly rent by Venmo as one bill each, not four monthly ones", () => {
    const zelle = every("2026-07-03", 14, 9).map((d) => tx(d, -47_500, null, "ZELLE TO OAK STREET LANDLORD CONF# K8QX", transfer()));
    expect(detectRecurring(zelle)).toMatchObject([{ kind: "bill", frequency: "biweekly", latestAmountCents: -47_500, occurrences: 9 }]);
    const venmo = every("2026-08-07", 7, 13).map((d, i) => tx(d, -15_000, "Venmo", `VENMO PAYMENT 77${i}31`, transfer()));
    const friends = ["2026-08-12", "2026-08-30", "2026-09-17", "2026-10-02", "2026-10-21"].map((d, i) =>
      tx(d, -[1_250, 2_830, 940, 1_710, 2_260][i], "Venmo", `VENMO PAYMENT 51${i}`, transfer()),
    );
    expect(detectRecurring([...venmo, ...friends])).toMatchObject([{ kind: "bill", frequency: "weekly", latestAmountCents: -15_000, occurrences: 13 }]);
  });

  it("still needs enough charges at one exact amount, every one on schedule", () => {
    const three = every("2026-10-09", 7, 3).map((d) => tx(d, -15_000, "Venmo", "VENMO PAYMENT 1", transfer()));
    expect(detectRecurring(three)).toEqual([]);
    const moving = every("2026-07-03", 14, 8).map((d, i) => tx(d, -(40_000 + i * 2_500), null, "ZELLE TO OAK STREET LANDLORD", transfer()));
    expect(detectRecurring(moving)).toEqual([]);
    const late = ["2026-07-03", "2026-07-17", "2026-08-05", "2026-08-14", "2026-08-28"].map((d) =>
      tx(d, -47_500, null, "ZELLE TO OAK STREET LANDLORD", transfer()),
    );
    expect(detectRecurring(late)).toEqual([]);
  });
});

describe("payment-app lines from every big bank keep who the money went to (review: one key per payee)", () => {
  // Two payees per format, as the bank prints them.
  const formats: [string, (who: string, i: number) => string][] = [
    ["Chase", (who, i) => `Zelle Payment To ${who} JPM99a${i}c123`],
    ["Capital One", (who) => `Zelle money sent to ${who}`],
    ["Bank of America", (who, i) => `Zelle Transfer Conf# 4ab${i}c; ${who}`],
    ["Wells Fargo", (who, i) => `ZELLE TO ${who.split(" ").reverse().join(" ").toUpperCase()} ON 10/0${i + 1} REF # WFCT0XYZ12${i}4`],
    ["credit union", (who, i) => `ZELLE TO ${who.toUpperCase()} CONF# Q${i}KX8ZT`],
    ["credit union P2P", (who) => `P2P ZELLE SENT ${who.toUpperCase()}`],
    ["Venmo by card", (who) => `VENMO *${who.toUpperCase()}`],
    ["Cash App", (who) => `Cash App*${who}`],
  ];
  for (const [bank, line] of formats)
    it(`${bank}: one key per payee`, () => {
      const key = (who: string, i: number) => merchantKey({ merchantName: "Zelle", description: line(who, i) });
      expect(key("Jordan Miller", 0)).toBe(key("Jordan Miller", 1));
      expect(key("Jordan Miller", 0)).not.toBe(key("Priya Shah", 0));
      expect(key("Jordan Miller", 0)).not.toMatch(/\b(?:money|sent|to|payment|transfer|on|conf|ref)\b/);
    });

  it("names the bill by who it went to, and finds a share that moves among other payees", () => {
    const rent = months("2026-07-01", 4).map((d) => tx(d, -60_000, "Zelle", "Zelle money sent to Jordan Miller", transfer()));
    const share = months("2026-07-12", 4).map((d, i) => tx(d, -[5_290, 4_322, 5_729, 4_870][i], "Zelle", "Zelle money sent to Priya Shah", transfer()));
    const r = detectRecurring([...rent, ...share], { today: "2026-11-05" });
    expect(r.map((c) => [c.name, c.latestAmountCents]).sort()).toEqual([
      ["Zelle to Jordan Miller", -60_000],
      ["Zelle to Priya Shah", -4_870],
    ]);
  });

  it("keys Venmo's ACH lines, which name no payee, as Venmo", () => {
    expect(merchantKey({ merchantName: "Venmo", description: "VENMO PAYMENT 1023456789" })).toBe("venmo");
    expect(merchantKey({ merchantName: null, description: "PAYPAL *HULU 402-935-7733" })).toBe("hulu");
  });
});

describe("keys saved before the vendor tidy still match (review: old rules)", () => {
  it("maps a stored key through the brand list", () => {
    expect(storedKeyForms("comcast")).toContain(merchantKey({ merchantName: "Xfinity", description: "COMCAST CABLE COMM" }));
    expect(storedKeyForms("verizon wireless")).toContain(merchantKey({ merchantName: "Verizon", description: "VERIZON WIRELESS PAYMENTS" }));
    expect(storedKeyForms("hbo max")).toContain(merchantKey({ merchantName: "Max", description: "HBO MAX" }));
    expect(storedKeyForms("google one")).toContain(merchantKey({ merchantName: "Google", description: "GOOGLE *GOOGLE ONE" }));
    expect(storedKeyForms("blue bottle coffee")).toEqual(["blue bottle coffee"]);
  });
});

describe("brands that share a word stay separate bills (review: over-broad brand patterns)", () => {
  it("keeps the Southwest Gas bill whole when Southwest Airlines flights are on the same feed", () => {
    const gas = months("2026-05-18", 6).map((d, i) =>
      tx(d, -[6_210, 4_480, 3_920, 4_105, 5_330, 7_940][i], "Southwest Gas Corp", "SOUTHWEST GAS CORP PAYMENT", { categoryName: "Utilities" }),
    );
    const flights = ["2026-06-02", "2026-08-21", "2026-10-09"].map((d, i) =>
      tx(d, -[18_940, 24_120, 15_670][i], "Southwest Airlines", "SOUTHWEST AIRLINES 52621912", { categoryName: "Flights" }),
    );
    const r = detectRecurring([...gas, ...flights], { today: "2026-11-05" });
    expect(r.map((c) => [c.name, c.kind, c.occurrences])).toEqual([["Southwest Gas Corp", "bill", 6]]);
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("finds Verizon Fios and Verizon Wireless, and Xfinity internet and Xfinity Mobile, as separate bills", () => {
    const bill = (start: string, cents: number, merchantName: string, description: string, categoryName: string) =>
      months(start, 4).map((d) => tx(d, -cents, merchantName, description, { categoryName }));
    const r = detectRecurring(
      [
        ...bill("2026-07-08", 7_999, "Verizon Fios", "VERIZON FIOS 800-837-4966", "Internet"),
        ...bill("2026-07-08", 6_500, "Verizon", "VERIZON WIRELESS PAYMENTS", "Phone"),
        ...bill("2026-07-14", 5_500, "Xfinity", "COMCAST CABLE COMM", "Internet"),
        ...bill("2026-07-20", 3_000, "Xfinity Mobile", "XFINITY MOBILE 888-936-4968", "Phone"),
      ],
      { today: "2026-11-05" },
    );
    expect(Object.fromEntries(r.map((c) => [c.merchantKey, c.latestAmountCents]))).toEqual({
      verizon: -6_500,
      "verizon fios": -7_999,
      xfinity: -5_500,
      "xfinity mobile": -3_000,
    });
  });
});
