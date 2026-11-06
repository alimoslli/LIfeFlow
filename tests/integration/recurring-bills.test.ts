import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { billsAndPace, budgetWarnings } from "@/server/services/finance/forecast";
import { createRecurring, setBudget, suggestRecurring, upcomingRecurring } from "@/server/services/finance/planning";
import { nthOccurrence } from "@/server/services/finance/recurring-detect";
import { subscriptionsOverview, trackFound } from "@/server/services/finance/subscriptions";
import { createTransaction } from "@/server/services/finance/transactions";
import { DETECTORS } from "@/server/services/proactive/detectors";
import { saveMessage } from "@/server/services/proactive/engine";
import { makeUser, TZ } from "../helpers";

/** The bills-and-subscriptions finder end to end (audit 2026-11-05: A4 to A7, A15 to A17). */
afterAll(closeDb);
const TODAY = "2026-11-05";
const monthsBack = (today: string, n: number, day: number) =>
  Array.from({ length: n }, (_, i) => nthOccurrence(`${today.slice(0, 8)}${String(day).padStart(2, "0")}`, "monthly", i - n));

async function accounts(s: UserScope) {
  return {
    checking: await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 300_000 }),
    savings: await createManualAccount(s, { name: "Savings", type: "depository", subtype: "savings", currentBalanceCents: 100_000 }),
    card: await createManualAccount(s, { name: "Visa", type: "credit", currentBalanceCents: 20_000 }),
  };
}

describe("bills paid by transfer (A4)", () => {
  it("finds a car loan and rent by Zelle as bills, and leaves savings transfers and card payments out", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const a = await accounts(s);
      const add = (accountId: string, date: string, description: string, amountCents: number) =>
        createTransaction(s, { accountId, date, description, amountCents, kind: "transfer" });
      for (const d of ["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-12"]) await add(a.checking.id, d, "GRANITE FCU AUTO LOAN PMT", -38_900);
      for (const d of ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"])
        await add(a.checking.id, d, `ZELLE TO JORDAN M CONF# ${d.replace(/-/g, "")}X`, -60_000);
      // Both halves of a move to savings and of a card payment, with lines that don't say what they are.
      for (const d of ["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"]) {
        await add(a.checking.id, d, "MOBILE XFER 8812", -20_000);
        await add(a.savings.id, d, "MOBILE XFER 8812", 20_000);
        await add(a.checking.id, d, "ONLINE PMT 5521", -15_000);
        await add(a.card.id, d, "ONLINE PMT 5521", 15_000);
      }
    });
    const found = await run((s) => suggestRecurring(s, TODAY));
    expect(found.map((c) => [c.kind, c.frequency, c.latestAmountCents]).sort()).toEqual([
      ["bill", "monthly", -38_900],
      ["bill", "monthly", -60_000],
    ]);
    // They're in the next 30 days of bills too.
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, addDaysStr(TODAY, 30)));
    expect(bills.map((b) => [b.date, b.amountCents])).toEqual([
      [TODAY, -60_000], // Nov 1's rent hasn't gone out yet: a few days late, so still due, dated today
      ["2026-11-12", -38_900],
      ["2026-12-01", -60_000],
    ]);
  });
});

describe("two subscriptions from one merchant (A5)", () => {
  it("finds iCloud and Apple Music separately, tracks the one tapped, and never calls them the same service", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { card } = await accounts(s);
      for (const d of ["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"])
        await createTransaction(s, { accountId: card.id, date: d, description: "APPLE.COM/BILL", merchantName: "Apple", amountCents: -299 });
      for (const d of ["2026-07-20", "2026-08-20", "2026-09-20", "2026-10-20"])
        await createTransaction(s, { accountId: card.id, date: d, description: "APPLE.COM/BILL", merchantName: "Apple", amountCents: -1_099 });
      await createTransaction(s, { accountId: card.id, date: "2026-09-11", description: "APPLE.COM/BILL", merchantName: "Apple", amountCents: -499 });
    });
    const found = await run((s) => suggestRecurring(s, TODAY));
    expect(found.map((c) => [c.seriesKey, c.latestAmountCents, c.nextExpectedDate])).toEqual(
      expect.arrayContaining([
        ["apple~d3", -299, "2026-11-03"],
        ["apple~d20", -1_099, "2026-11-20"],
      ]),
    );
    expect(found).toHaveLength(2);

    // Tracking Apple Music doesn't hide iCloud, and Apple Music's charges are its own (no price "increase" from $2.99).
    await run((s) => trackFound(s, TODAY, "apple~d20"));
    const o = await run((s) => subscriptionsOverview(s, TODAY));
    expect(o.subscriptions.map((x) => [x.name, x.amountCents, x.chargeCount, x.priceUp])).toEqual([["Apple", -1_099, 4, null]]);
    expect(o.found.map((c) => c.latestAmountCents)).toEqual([-299]);
    expect(o.monthlyCents).toBe(1_099 + 299);

    await run((s) => trackFound(s, TODAY, "apple~d3"));
    const both = await run((s) => subscriptionsOverview(s, TODAY));
    expect(both.subscriptions.map((x) => x.amountCents).sort()).toEqual([-1_099, -299]);
    expect(both.found).toEqual([]);
    expect(both.flags).toEqual([]);
  });
});

describe("a price change on a subscription not tracked yet (A6)", () => {
  it("flags Netflix going from $15.49 to $17.99 on the first changed charge, once, before and after it's tracked", async () => {
    const { run } = await makeUser();
    const today = todayIn(TZ);
    const [a, b, c] = monthsBack(today, 3, 2);
    await run(async (s) => {
      const { card } = await accounts(s);
      for (const [d, cents] of [
        [a, 1_549],
        [b, 1_549],
        [c, 1_799],
      ] as const)
        await createTransaction(s, { accountId: card.id, date: d, description: "NETFLIX.COM", merchantName: "Netflix", amountCents: -cents });
    });
    const o = await run((s) => subscriptionsOverview(s, today));
    expect(o.found).toMatchObject([{ name: "Netflix", latestAmountCents: -1_799 }]);
    expect(o.found[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(o.flags).toEqual([
      expect.objectContaining({ kind: "price_up", name: "Netflix", fromCents: 1_549, toCents: 1_799, date: c, yearlyExtraCents: 3_000 }),
    ]);
    expect(o.monthlyCents).toBe(1_799);

    const now = new Date();
    const watch = async () =>
      (await run((s) => DETECTORS.subscriptionWatch({ scope: s, tz: TZ, today, now }))).filter((m) => m.kind === "subscription_price_up");
    const first = await watch();
    expect(first).toEqual([expect.objectContaining({ facts: { name: "Netflix", fromCents: 1_549, toCents: 1_799, yearlyExtraCents: 3_000 } })]);
    expect(await run((s) => saveMessage(s, first[0], "friend", false, "midday"))).not.toBeNull();
    // Later runs, and after tracking it: the same change, so no second message.
    expect(await run((s) => saveMessage(s, first[0], "friend", false, "evening"))).toBeNull();
    await run((s) => trackFound(s, today, "netflix"));
    const tracked = await run((s) => subscriptionsOverview(s, today));
    expect(tracked.subscriptions).toMatchObject([{ name: "Netflix", priceUp: { fromCents: 1_549, toCents: 1_799 } }]);
    const after = await watch();
    expect(after.map((m) => m.dedupeKey)).toEqual([first[0].dedupeKey]);
    expect(await run((s) => saveMessage(s, after[0], "friend", false, "midday"))).toBeNull();
  });
});

describe("a double charge on a subscription that has run for months (A7)", () => {
  it("raises the double-charge message", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { card } = await accounts(s);
      for (const d of ["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-10-15"])
        await createTransaction(s, { accountId: card.id, date: d, description: "Spotify USA", merchantName: "Spotify", amountCents: -1_199 });
    });
    const out = await run((s) => DETECTORS.moneyFinds({ scope: s, tz: TZ, today: TODAY, now: new Date(`${TODAY}T17:00:00Z`) }));
    expect(out).toEqual([
      expect.objectContaining({ kind: "double_charge", facts: { merchant: "Spotify", amountCents: 1_199, first: "Oct 15", second: "Oct 15" } }),
    ]);
  });
});

describe("month-end bills keep their day (A15)", () => {
  it("projects a tracked bill due Jan 31 and a found one on the 31st on the last day of each month", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { checking } = await accounts(s);
      await createRecurring(s, { name: "Storage unit", amountCents: -8_000, frequency: "monthly", nextDueDate: "2027-01-31", kind: "bill" });
      for (const d of ["2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31"])
        await createTransaction(s, { accountId: checking.id, date: d, description: "COMCAST", merchantName: "Comcast", amountCents: -4_500 });
    });
    const tracked = await run((s) => upcomingRecurring(s, "2027-02-01", "2027-05-31"));
    expect(tracked.map((u) => u.date)).toEqual(["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, "2027-03-31"));
    expect(bills.filter((b) => b.name === "Comcast").map((b) => b.date)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  });
});

describe("only real bills are offered (A16)", () => {
  it("leaves a coffee shop and a doubtful series out of the suggestions the Bills page and the assistant read", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { checking } = await accounts(s);
      const coffee = (await getCategoryByName(s, "Coffee"))!;
      for (const [d, cents] of [
        ["2026-09-23", 642],
        ["2026-09-30", 468],
        ["2026-10-07", 530],
        ["2026-10-14", 511],
        ["2026-10-21", 674],
        ["2026-10-28", 539],
      ] as const)
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "DAILY GRIND",
          merchantName: "Daily Grind",
          amountCents: -cents,
          categoryId: coffee.id,
        });
      // Same day each month, but the price more than doubled: scored 0.5, under the bar.
      for (const [d, cents] of [
        ["2026-08-09", 2_500],
        ["2026-09-09", 2_500],
        ["2026-10-09", 5_500],
      ] as const)
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "RIVERSIDE CLIMBING",
          merchantName: "Riverside Climbing",
          amountCents: -cents,
        });
      for (const d of ["2026-08-04", "2026-09-04", "2026-10-04"])
        await createTransaction(s, { accountId: checking.id, date: d, description: "T-MOBILE AUTOPAY", merchantName: "T-Mobile", amountCents: -6_500 });
    });
    expect((await run((s) => suggestRecurring(s, TODAY))).map((c) => c.name)).toEqual(["T-Mobile"]);
  });
});

describe("the budget fix never cuts essentials (A17)", () => {
  it("suggests skipping takeout, not the grocery store, on a Food & Dining budget", async () => {
    const { run } = await makeUser();
    const today = "2026-10-14";
    await run(async (s) => {
      const { checking } = await accounts(s);
      const food = await getCategoryByName(s, "Food & Dining");
      const groceries = await getCategoryByName(s, "Groceries");
      const delivery = await getCategoryByName(s, "Food Delivery");
      await setBudget(s, { month: today, categoryId: food!.id, limitCents: 45_000 });
      // Trader Joe's is the biggest merchant here (the old fix said "Skip 1 Trader Joe's purchase").
      for (const d of ["2026-10-02", "2026-10-07", "2026-10-12"])
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "TRADER JOE'S #552",
          merchantName: "Trader Joe's",
          amountCents: -4_050,
          categoryId: groceries!.id,
        });
      for (const d of ["2026-10-03", "2026-10-09", "2026-10-13"])
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "DOORDASH*ORDER",
          merchantName: "DoorDash",
          amountCents: -3_300,
          categoryId: delivery!.id,
        });
    });
    const [w] = await run((s) => budgetWarnings(s, today));
    expect(w.status).toBe("heading_over");
    expect(w.fix).toBe("Skip 2 DoorDash purchases (about $33 each) and you're back on track.");
  });
});
