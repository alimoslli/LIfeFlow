import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { and, eq } from "drizzle-orm";
import { categoryRules, integrations, transactions } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { learnCategoryRule, ruleFor } from "@/server/services/finance/categorize";
import { billsAndPace, budgetWarnings } from "@/server/services/finance/forecast";
import { createRecurring, setBudget, suggestRecurring, upcomingRecurring } from "@/server/services/finance/planning";
import { subscriptionsOverview, trackFound } from "@/server/services/finance/subscriptions";
import { tidyTransactions } from "@/server/services/finance/tidy";
import { createTransaction } from "@/server/services/finance/transactions";
import { DETECTORS } from "@/server/services/proactive/detectors";
import { saveMessage } from "@/server/services/proactive/engine";
import { makeUser, TZ } from "../helpers";

/** The bills-and-subscriptions finder end to end (audit 2026-11-05: A4 to A7, A15 to A17). */
afterAll(closeDb);
const TODAY = "2026-11-05";

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

describe("a hand-tracked bill paid by transfer is counted once (review 3)", () => {
  it("lets 'Rent' and 'Car loan' claim the Zelle and loan series, and a posted payment pays the due date", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { checking } = await accounts(s);
      const add = (date: string, description: string, amountCents: number) =>
        createTransaction(s, { accountId: checking.id, date, description, amountCents, kind: "transfer" });
      for (const d of ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-02"]) await add(d, `ZELLE TO JORDAN M CONF# ${d.replace(/-/g, "")}Q`, -60_000);
      for (const d of ["2026-08-10", "2026-09-10", "2026-10-12"]) await add(d, "GRANITE FCU AUTO LOAN PMT", -38_900);
      await createRecurring(s, { name: "Rent", amountCents: -60_000, frequency: "monthly", nextDueDate: "2026-11-01", kind: "bill" });
      await createRecurring(s, { name: "Car loan", amountCents: -38_900, frequency: "monthly", nextDueDate: "2026-11-10", kind: "bill" });
    });
    expect(await run((s) => suggestRecurring(s, TODAY))).toEqual([]);
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-15"));
    // Nov 1's rent went out by Zelle on Nov 2, so the next rent is Dec 1; each bill once, under the user's name.
    expect(bills.map((b) => [b.name, b.date, b.amountCents, b.found])).toEqual([
      ["Car loan", "2026-11-10", -38_900, false],
      ["Rent", "2026-12-01", -60_000, false],
      ["Car loan", "2026-12-10", -38_900, false],
    ]);
    expect((await run((s) => upcomingRecurring(s, TODAY, "2026-11-30"))).map((u) => [u.name, u.date])).toEqual([["Car loan", "2026-11-10"]]);
  });
});

describe("usual spending leaves out a bill's own charges, not its merchant (review 2)", () => {
  it("keeps the other Amazon orders in day-to-day spending next to a monthly Amazon charge", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { card } = await accounts(s);
      const amazon = (date: string, cents: number) =>
        createTransaction(s, { accountId: card.id, date, description: "AMAZON", merchantName: "Amazon", amountCents: -cents });
      for (const d of ["2026-07-26", "2026-08-26", "2026-09-26", "2026-10-26"]) await amazon(d, 1_499);
      for (const [d, cents] of [
        ["2026-09-15", 4_000],
        ["2026-10-03", 6_000],
        ["2026-10-20", 5_000],
      ] as const)
        await amazon(d, cents);
    });
    expect((await run((s) => suggestRecurring(s, TODAY))).map((c) => c.latestAmountCents)).toEqual([-1_499]);
    const { typical } = await run((s) => billsAndPace(s, TODAY, TODAY, addDaysStr(TODAY, 30)));
    // $150 of orders since Sep 15 (51 days), the $14.99 charges left out.
    expect(typical).toEqual({ dailyCents: Math.round(15_000 / 51), basedOnDays: 51 });
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
    // A month apart, the last one 5 days ago: still billing, the change recent, and its cycle's due window has passed.
    const [a, b, c] = [-65, -35, -5].map((n) => addDaysStr(today, n));
    await run(async (s) => {
      const { card } = await accounts(s);
      for (const [d, cents] of [
        [a, 1_549],
        [b, 1_549],
        [c, 1_799],
      ] as const)
        await createTransaction(s, { accountId: card.id, date: d, description: "NETFLIX.COM", merchantName: "Netflix", amountCents: -cents });
      // Everyday spending since then: the feed is current, so the due window has really passed.
      await createTransaction(s, { accountId: card.id, date: today, description: "CORNER CAFE", merchantName: "Corner Cafe", amountCents: -450 });
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
    // Later runs: the same change, so no second message.
    expect(await run((s) => saveMessage(s, first[0], "friend", false, "evening"))).toBeNull();
    // Tracked, it keeps the tracked key (`sub_price:<id>:<new price>`), but this change was already announced.
    const item = await run((s) => trackFound(s, today, "netflix"));
    const tracked = await run((s) => subscriptionsOverview(s, today));
    expect(tracked.subscriptions).toMatchObject([{ name: "Netflix", priceUp: { fromCents: 1_549, toCents: 1_799 } }]);
    expect(tracked.flags).toEqual([expect.objectContaining({ kind: "price_up", alertKey: `${item.id}:1799` })]);
    expect(await watch()).toEqual([]);
  });

  it("alerts a tracked subscription's price rise under its own key, only while it's recent (review 4)", async () => {
    const { run } = await makeUser();
    const today = todayIn(TZ);
    const at = (n: number) => addDaysStr(today, n);
    const ids = await run(async (s) => {
      const { card } = await accounts(s);
      const charge = (name: string, date: string, cents: number) =>
        createTransaction(s, { accountId: card.id, date, description: name, merchantName: name, amountCents: -cents });
      // Hulu went up 5 days ago; Spotify went up four months ago.
      for (const [d, c] of [
        [at(-65), 1_799],
        [at(-35), 1_799],
        [at(-5), 1_899],
      ] as const)
        await charge("Hulu", d, c);
      for (const [d, c] of [
        [at(-182), 1_099],
        [at(-152), 1_099],
        [at(-121), 1_199],
        [at(-91), 1_199],
        [at(-61), 1_199],
        [at(-31), 1_199],
        [at(-1), 1_199],
      ] as const)
        await charge("Spotify", d, c);
      const hulu = await createRecurring(s, { name: "Hulu", amountCents: -1_899, frequency: "monthly", nextDueDate: at(29), kind: "subscription" });
      await createRecurring(s, { name: "Spotify", amountCents: -1_199, frequency: "monthly", nextDueDate: at(29), kind: "subscription" });
      return { hulu: hulu.id };
    });
    const out = (await run((s) => DETECTORS.subscriptionWatch({ scope: s, tz: TZ, today, now: new Date() }))).filter((m) => m.kind === "subscription_price_up");
    expect(out.map((m) => [m.dedupeKey, (m.facts as { name: string }).name])).toEqual([[`sub_price:${ids.hulu}:1899`, "Hulu"]]);
    // Spotify's older rise still shows on the Subscriptions page.
    expect(
      (await run((s) => subscriptionsOverview(s, today))).flags
        .filter((f) => f.kind === "price_up")
        .map((f) => f.name)
        .sort(),
    ).toEqual(["Hulu", "Spotify"]);
  });
});

describe("a quiet account (review follow-up: today passed explicitly)", () => {
  it("confirms a price rise once the bank has synced past its due window, without waiting for another purchase", async () => {
    const { run } = await makeUser();
    const today = todayIn(TZ);
    await run(async (s) => {
      const { card } = await accounts(s);
      for (const [n, cents] of [
        [-65, 1_549],
        [-35, 1_549],
        [-5, 1_799],
      ] as const)
        await createTransaction(s, {
          accountId: card.id,
          date: addDaysStr(today, n),
          description: "NETFLIX.COM",
          merchantName: "Netflix",
          amountCents: -cents,
        });
    });
    // Nothing newer than the $17.99 charge, and no bank connection: it might still be a one-off, so it waits.
    expect((await run((s) => subscriptionsOverview(s, today))).found).toMatchObject([{ latestAmountCents: -1_549, priceChange: null }]);
    // The bank synced this morning: the feed is current, the due window has passed with no $15.49 charge.
    await run((s) =>
      s.tx.insert(integrations).values({ userId: s.userId, provider: "plaid", status: "connected", externalId: "item-quiet", lastSyncedAt: new Date() }),
    );
    const o = await run((s) => subscriptionsOverview(s, today));
    expect(o.found).toMatchObject([{ latestAmountCents: -1_799, priceChange: { fromCents: -1_549, toCents: -1_799 } }]);
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
    // Saved under its everyday name by the vendor tidy (Comcast's service is Xfinity).
    const comcast = bills.filter((b) => b.found && b.amountCents === -4_500);
    expect(comcast.map((b) => b.date)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(new Set(comcast.map((b) => b.name))).toEqual(new Set(["Xfinity"]));
  });
});

describe("keys saved before the vendor tidy (review: old rules and alerts)", () => {
  it("applies a category rule saved as 'comcast' to a row now tidied as Xfinity", async () => {
    const { run } = await makeUser();
    const got = await run(async (s) => {
      const { checking } = await accounts(s);
      const utilities = (await getCategoryByName(s, "Utilities"))!;
      // Saved before the tidy, from the bank's old name (the keywords alone would say Internet).
      await s.tx.insert(categoryRules).values({ userId: s.userId, merchantKey: "comcast", label: "Comcast", categoryId: utilities.id });
      const t = await createTransaction(s, {
        accountId: checking.id,
        date: "2026-11-02",
        description: "COMCAST CABLE COMM 800-COMCAST",
        merchantName: "Comcast",
        amountCents: -7_999,
      });
      return { merchantName: t!.merchantName, categoryId: t!.categoryId, utilities: utilities.id };
    });
    expect(got.merchantName).toBe("Xfinity");
    expect(got.categoryId).toBe(got.utilities);
  });

  it("doesn't send a Zelle rent alert again because its key changed from 'zelle' to who it went to", async () => {
    const { run } = await makeUser();
    const today = "2026-10-30";
    await run(async (s) => {
      const { checking } = await accounts(s);
      for (const d of ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"])
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "Zelle money sent to Jordan Miller",
          amountCents: -60_000,
          kind: "transfer",
        });
    });
    const now = new Date(`${today}T14:00:00Z`);
    const due = async () => (await run((s) => DETECTORS.billsDue({ scope: s, tz: TZ, today, now }))).map((m) => m.dedupeKey);
    expect(await due()).toEqual(["bill_due:found:zelle jordan miller:2026-11-01"]);
    // An alert for this cycle already went out under the old key ("zelle", how every Zelle payment read after the tidy).
    await run((s) =>
      saveMessage(
        s,
        {
          kind: "bill_due",
          topic: "money",
          dedupeKey: "bill_due:found:zelle:2026-11-01",
          facts: { bill: "Zelle", billCents: 60_000, dueIn: "in 2 days", cashCents: 300_000 },
          priority: 55,
        },
        "friend",
        false,
        "morning",
      ),
    );
    expect(await due()).toEqual([]);
  });
});

describe("bills under the tidied vendor names (merge with the vendor tidy)", () => {
  it("lets a bill tracked as 'Comcast' claim the bank's charges, now shown as Xfinity, so it's counted once", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { checking } = await accounts(s);
      for (const d of ["2026-08-12", "2026-09-12", "2026-10-12"])
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "COMCAST CABLE COMM 800-COMCAST",
          merchantName: "Comcast",
          amountCents: -7_999,
        });
      await createRecurring(s, { name: "Comcast", amountCents: -7_999, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" });
    });
    expect(await run((s) => suggestRecurring(s, TODAY))).toEqual([]);
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-15"));
    expect(bills.map((b) => [b.name, b.date, b.found])).toEqual([
      ["Comcast", "2026-11-12", false],
      ["Comcast", "2026-12-12", false],
    ]);
  });

  it("keeps rent to a roommate and a share to Mom apart, and named by who they went to, though both now read 'Zelle'", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { checking } = await accounts(s);
      const zelle = (date: string, to: string, cents: number) =>
        createTransaction(s, {
          accountId: checking.id,
          date,
          description: `ZELLE TO ${to} CONF# Q${date.replace(/-/g, "")}K`,
          amountCents: -cents,
          kind: "transfer",
        });
      for (const d of ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-02"]) await zelle(d, "JORDAN M", 60_000);
      for (const d of ["2026-08-15", "2026-09-15", "2026-10-15"]) await zelle(d, "MOM", 60_000);
    });
    const found = await run((s) => suggestRecurring(s, TODAY));
    expect(found.map((c) => [c.name, c.kind, c.latestAmountCents]).sort()).toEqual([
      ["Zelle to Jordan M", "bill", -60_000],
      ["Zelle to Mom", "bill", -60_000],
    ]);
  });
});

describe("only real bills are offered (A16)", () => {
  it("leaves a coffee shop and a doubtful series out of the suggestions the Bills page and the skyling read", async () => {
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

  it("doesn't say to pause Food & Dining (it holds groceries) once the budget is over", async () => {
    const { run } = await makeUser();
    const today = "2026-10-20";
    await run(async (s) => {
      const { checking } = await accounts(s);
      const food = await getCategoryByName(s, "Food & Dining");
      const groceries = await getCategoryByName(s, "Groceries");
      await setBudget(s, { month: today, categoryId: food!.id, limitCents: 10_000 });
      for (const d of ["2026-10-02", "2026-10-09", "2026-10-16"])
        await createTransaction(s, {
          accountId: checking.id,
          date: d,
          description: "TRADER JOE'S #552",
          merchantName: "Trader Joe's",
          amountCents: -4_050,
          categoryId: groceries!.id,
        });
    });
    const [w] = await run((s) => budgetWarnings(s, today));
    expect(w.status).toBe("over");
    expect(w.fix).toBe(
      "This budget is already over by $21.50. Raise the limit to what you really spend on Food & Dining, or move the difference from a budget for wants.",
    );
  });
});

describe("rows the earlier vendor tidy named too broadly (review: final check)", () => {
  it("keys a Southwest Gas bill stored as 'Southwest Airlines' by its bank line, and the re-tidy renames only what the tidy wrote", async () => {
    const { run } = await makeUser();
    const got = await run(async (s) => {
      const { checking, card } = await accounts(s);
      const utilities = (await getCategoryByName(s, "Utilities"))!;
      const gas = [6_210, 4_480, 3_920, 4_105, 5_330, 7_940];
      for (const [i, cents] of gas.entries())
        await createTransaction(s, {
          accountId: checking.id,
          date: addDaysStr("2026-05-18", Math.round(i * 30.4)),
          description: "SOUTHWEST GAS",
          amountCents: -cents,
          categoryId: utilities.id,
        });
      for (const [d, cents] of [
        ["2026-06-02", 18_940],
        ["2026-08-21", 24_120],
        ["2026-10-09", 15_670],
      ] as const)
        await createTransaction(s, { accountId: card.id, date: d, description: "SOUTHWEST AIRLINES 5262191234567", amountCents: -cents });
      const fios = await createTransaction(s, { accountId: checking.id, date: "2026-10-20", description: "VERIZON FIOS 800-837-4966", amountCents: -8_999 });
      // What the earlier tidy stored: every "southwest" line as the airline, Fios as "Verizon".
      await s.tx
        .update(transactions)
        .set({ merchantName: "Southwest Airlines" })
        .where(and(eq(transactions.userId, s.userId), eq(transactions.description, "SOUTHWEST GAS")));
      await s.tx.update(transactions).set({ merchantName: "Verizon" }).where(eq(transactions.id, fios!.id));
      // A name the person typed stays theirs.
      const mine = await createTransaction(s, { accountId: checking.id, date: "2026-10-22", description: "VERIZON FIOS 800-837-4966", amountCents: -1_000 });
      await s.tx.update(transactions).set({ merchantName: "Home internet" }).where(eq(transactions.id, mine!.id));

      const before = (await suggestRecurring(s, TODAY)).map((c) => [c.name, c.merchantKey, c.occurrences]);
      const tidied = await tidyTransactions(s, { llm: null });
      const rows = await s.tx.select({ d: transactions.description, n: transactions.merchantName }).from(transactions).where(eq(transactions.userId, s.userId));
      const after = (await suggestRecurring(s, TODAY)).map((c) => [c.name, c.merchantKey, c.occurrences]);
      return { before, after, tidied, names: [...new Set(rows.map((r) => `${r.d} = ${r.n}`))].sort() };
    });
    expect(got.before).toEqual([["Southwest Gas", "southwest gas", 6]]);
    expect(got.after).toEqual([["Southwest Gas", "southwest gas", 6]]);
    expect(got.tidied.renamed).toBe(7);
    expect(got.names).toEqual([
      "SOUTHWEST AIRLINES 5262191234567 = Southwest Airlines",
      "SOUTHWEST GAS = Southwest Gas",
      "VERIZON FIOS 800-837-4966 = Home internet",
      "VERIZON FIOS 800-837-4966 = Verizon Fios",
    ]);
  });

  it("keeps YouTube TV and YouTube Premium apart: their own keys, series and category rules", async () => {
    const { run } = await makeUser();
    const got = await run(async (s) => {
      const { card } = await accounts(s);
      const [streaming, subscriptions] = [(await getCategoryByName(s, "Streaming"))!, (await getCategoryByName(s, "Subscriptions"))!];
      for (let i = 0; i < 5; i++) {
        await createTransaction(s, {
          accountId: card.id,
          date: addDaysStr("2026-06-12", Math.round(i * 30.4)),
          description: "YOUTUBE TV 855-978-3324",
          amountCents: -8_299,
        });
        await createTransaction(s, {
          accountId: card.id,
          date: addDaysStr("2026-06-03", Math.round(i * 30.4)),
          description: "GOOGLE *YouTube Premium",
          amountCents: -1_399,
        });
      }
      const tv = { merchantName: "YouTube TV", description: "YOUTUBE TV 855-978-3324" };
      const premium = { merchantName: "YouTube", description: "GOOGLE *YouTube Premium" };
      await learnCategoryRule(s, tv, streaming.id);
      await learnCategoryRule(s, premium, subscriptions.id);
      // Learning one never replaces the other's rule; a TV row the earlier tidy stored as "YouTube" is still TV.
      const rules = (await s.tx.select({ key: categoryRules.merchantKey }).from(categoryRules).where(eq(categoryRules.userId, s.userId)))
        .map((r) => r.key)
        .sort();
      const ids = {
        tv: (await ruleFor(s, tv))?.categoryId,
        oldTv: (await ruleFor(s, { merchantName: "YouTube", description: "YOUTUBE TV 855-978-3324" }))?.categoryId,
        premium: (await ruleFor(s, premium))?.categoryId,
      };
      const found = (await suggestRecurring(s, TODAY)).map((c) => [c.name, c.merchantKey, c.latestAmountCents]).sort();
      return { rules, ids, found, streaming: streaming.id, subscriptions: subscriptions.id };
    });
    expect(got.rules).toEqual(["youtube", "youtube tv"]);
    expect(got.ids).toEqual({ tv: got.streaming, oldTv: got.streaming, premium: got.subscriptions });
    expect(got.found).toEqual([
      ["YouTube TV", "youtube tv", -8_299],
      ["YouTube", "youtube", -1_399],
    ]);
  });
});
