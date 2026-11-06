import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { billsAndPace, cashForecast } from "@/server/services/finance/forecast";
import { createRecurring, listRecurring, setRecurringStatus, suggestRecurring, upcomingRecurring } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { DETECTORS } from "@/server/services/proactive/detectors";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const TODAY = "2026-11-05";

async function checking(s: UserScope, cents: number) {
  return createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: cents });
}

describe("one bill, counted once (A2)", () => {
  it("a tracked 'Rent, Parkview Apartments' and the bank's 'PARKVIEW APARTMENTS RENT' are one Dec 1 rent", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 300_000);
      const rent = (await getCategoryByName(s, "Rent"))!;
      for (const d of ["2026-09-01", "2026-10-01", "2026-11-01"])
        await createTransaction(s, {
          accountId: acct.id,
          date: d,
          description: "PARKVIEW APARTMENTS RENT",
          merchantName: "Parkview Apartments",
          amountCents: -95_000,
          categoryId: rent.id,
        });
      await createRecurring(s, {
        name: "Rent, Parkview Apartments",
        amountCents: -95_000,
        frequency: "monthly",
        nextDueDate: "2026-12-01",
        kind: "bill",
        categoryId: rent.id,
      });
    });
    const rentOn = (bills: { date: string; amountCents: number }[]) => bills.filter((b) => b.date === "2026-12-01" && b.amountCents === -95_000);

    const { bills, typical } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-05"));
    expect(rentOn(bills)).toHaveLength(1);
    expect(rentOn(bills)[0]).toMatchObject({ name: "Rent, Parkview Apartments", found: false });
    // Rent is a bill on its date, never part of day-to-day spending.
    expect(typical.dailyCents).toBe(0);

    const f = await run((s) => cashForecast(s, TODAY, 30));
    expect(rentOn(f.bills)).toHaveLength(1);
    expect(f.bills.reduce((n, b) => n - b.amountCents, 0)).toBe(95_000);
    expect((await run((s) => suggestRecurring(s, TODAY))).map((c) => c.name)).not.toContain("Parkview Apartments");
  });

  it("keeps a different bill from the same landlord (parking) as its own bill", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 300_000);
      for (const d of ["2026-09-01", "2026-10-01", "2026-11-01"]) {
        await createTransaction(s, { accountId: acct.id, date: d, description: "PARKVIEW APARTMENTS RENT", amountCents: -95_000 });
        await createTransaction(s, { accountId: acct.id, date: d, description: "PARKVIEW APARTMENTS PARKING", amountCents: -7_500 });
      }
      await createRecurring(s, { name: "Parkview Apartments", amountCents: -95_000, frequency: "monthly", nextDueDate: "2026-12-01", kind: "bill" });
    });
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-05"));
    expect(bills.map((b) => `${b.name} ${b.amountCents} ${b.found}`).sort()).toEqual([
      "Parkview Apartments -95000 false",
      "Parkview Apartments Parking -7500 true",
    ]);
  });
});

describe("a bill that already posted isn't due again (A3)", () => {
  it("leaves a bill paid today and one paid 2 days early out of the bills, Today's next bill and the bill message", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 200_000);
      const utilities = (await getCategoryByName(s, "Utilities"))!;
      // Tracked at $82; the bill moves month to month, and the bank took $69.06 today.
      await createRecurring(s, {
        name: "City Utilities",
        amountCents: -8_200,
        frequency: "monthly",
        nextDueDate: TODAY,
        kind: "bill",
        categoryId: utilities.id,
      });
      for (const [date, amountCents] of [
        ["2026-08-05", -9_510],
        ["2026-09-05", -7_840],
        ["2026-10-05", -8_800],
        [TODAY, -6_906],
      ] as const)
        await createTransaction(s, {
          accountId: acct.id,
          date,
          description: "CITY UTILITIES",
          merchantName: "City Utilities",
          amountCents,
          categoryId: utilities.id,
        });
      // Due today, posted 2 days early.
      await createRecurring(s, { name: "Mint Mobile", amountCents: -1_500, frequency: "monthly", nextDueDate: TODAY, kind: "bill" });
      await createTransaction(s, { accountId: acct.id, date: "2026-11-03", description: "MINT MOBILE", amountCents: -1_500 });
      // Not posted yet: still due.
      await createRecurring(s, { name: "Car insurance", amountCents: -12_000, frequency: "monthly", nextDueDate: "2026-11-07", kind: "bill" });
    });

    const week = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-11-12"));
    expect(week.bills.map((b) => b.name)).toEqual(["Car insurance"]);
    // Today's next bill is the first of these (src/app/(app)/page.tsx).
    expect(week.bills[0]).toMatchObject({ name: "Car insurance", date: "2026-11-07" });

    // The paid ones move to their next cycle when read.
    const later = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-10"));
    expect(later.bills.map((b) => `${b.name}@${b.date}`)).toEqual([
      "Car insurance@2026-11-07",
      "City Utilities@2026-12-05",
      "Mint Mobile@2026-12-05",
      "Car insurance@2026-12-07",
    ]);

    const messages = await run((s) => DETECTORS.billsDue({ scope: s, tz: TZ, today: TODAY, now: new Date(`${TODAY}T14:00:00Z`) }));
    expect(messages.map((m) => `${m.kind} ${m.facts.bill}`)).toEqual(["bill_due Car insurance"]);

    // Read time only: the stored rows keep their dates.
    expect((await run((s) => listRecurring(s))).find((r) => r.name === "City Utilities")!.nextDueDate).toBe(TODAY);
  });

  it("a hand-tracked bill that usually varies is paid by its first charge, before the bank has any history (R1)", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 200_000);
      const utilities = (await getCategoryByName(s, "Utilities"))!;
      // Tracked at $82; the first charge ever is $69.06, today.
      await createRecurring(s, {
        name: "City Utilities",
        amountCents: -8_200,
        frequency: "monthly",
        nextDueDate: TODAY,
        kind: "bill",
        categoryId: utilities.id,
      });
      await createTransaction(s, {
        accountId: acct.id,
        date: TODAY,
        description: "CITY UTILITIES",
        merchantName: "City Utilities",
        amountCents: -6_906,
        categoryId: utilities.id,
      });
      // No category picked: the name reads as a phone bill. $72 against $85, under its brand's key.
      await createRecurring(s, { name: "Verizon", amountCents: -8_500, frequency: "monthly", nextDueDate: TODAY, kind: "bill" });
      await createTransaction(s, { accountId: acct.id, date: "2026-11-04", description: "VERIZON WIRELESS PAYMENTS", amountCents: -7_200 });
      // A plan whose price doesn't move keeps the 10% band: $13 isn't the $15.49 plan.
      await createRecurring(s, { name: "Netflix", amountCents: -1_549, frequency: "monthly", nextDueDate: TODAY, kind: "subscription" });
      await createTransaction(s, { accountId: acct.id, date: TODAY, description: "NETFLIX.COM", amountCents: -1_300 });
    });

    const week = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-11-12"));
    expect(week.bills.map((b) => b.name)).toEqual(["Netflix"]);
    // Counted once: this cycle already left checking, so only December's is still to come.
    const later = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-10"));
    expect(later.bills.map((b) => `${b.date} ${b.name}`).sort()).toEqual([
      "2026-11-05 Netflix",
      "2026-12-05 City Utilities",
      "2026-12-05 Netflix",
      "2026-12-05 Verizon",
    ]);
    const messages = await run((s) => DETECTORS.billsDue({ scope: s, tz: TZ, today: TODAY, now: new Date(`${TODAY}T14:00:00Z`) }));
    expect(messages.map((m) => m.facts.bill)).not.toContain("City Utilities");
  });
});

describe("the urgent bill message reads the same bills as Today and Money (A14)", () => {
  it("warns about a bill found in the bank but never tracked when checking can't cover it", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 4_000);
      const phone = (await getCategoryByName(s, "Phone"))!;
      for (const d of ["2026-08-07", "2026-09-07", "2026-10-07"])
        await createTransaction(s, {
          accountId: acct.id,
          date: d,
          description: "T-MOBILE AUTOPAY",
          merchantName: "T-Mobile",
          amountCents: -8_500,
          categoryId: phone.id,
        });
    });
    // Today and Money see it on Nov 7...
    const { bills } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-11-08"));
    expect(bills).toEqual([expect.objectContaining({ name: "T-Mobile", date: "2026-11-07", amountCents: -8_500, found: true })]);

    // ...and so does the warning, as facts only (wording is in lib/jarvis-voice).
    const out = await run((s) => DETECTORS.billsDue({ scope: s, tz: TZ, today: TODAY, now: new Date(`${TODAY}T14:00:00Z`) }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "bill_short",
      urgent: true,
      dedupeKey: "bill_short:found:t mobile:2026-11-07",
      facts: { bill: "T-Mobile", billCents: 8_500, dueIn: "in 2 days", shortCents: 4_500 },
    });
  });

  it("keeps one alert for a late found bill: the key is its cycle, not the day it's shown on", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 4_000);
      for (const d of ["2026-08-07", "2026-09-07", "2026-10-07"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "T-MOBILE AUTOPAY", merchantName: "T-Mobile", amountCents: -8_500 });
    });
    const keys = new Set<string>();
    for (const today of ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]) {
      const out = await run((s) => DETECTORS.billsDue({ scope: s, tz: TZ, today, now: new Date(`${today}T14:00:00Z`) }));
      expect(out.map((m) => m.kind)).toEqual(["bill_short"]);
      for (const m of out) keys.add(m.dedupeKey);
    }
    expect([...keys]).toEqual(["bill_short:found:t mobile:2026-11-07"]);
    // Late but not posted yet, it still shows as due today.
    expect((await run((s) => billsAndPace(s, "2026-11-09", "2026-11-09", "2026-11-12"))).bills).toEqual([
      expect.objectContaining({ name: "T-Mobile", date: "2026-11-09" }),
    ]);
  });
});

describe("two $15.49 Netflix plans, only one tracked (R2)", () => {
  async function twoPlans(dates: string[]) {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 100_000);
      for (const date of dates) await createTransaction(s, { accountId: acct.id, date, description: "NETFLIX.COM", merchantName: "Netflix", amountCents: -1_549 });
      await createRecurring(s, { name: "Netflix", amountCents: -1_549, frequency: "monthly", nextDueDate: "2026-11-15", kind: "subscription" });
    });
    return run;
  }
  const show = (bills: { date: string; name: string; found: boolean }[]) => bills.map((b) => `${b.date} ${b.name}${b.found ? " (found)" : ""}`);

  it("the other plan's charge a week before the tracked due date doesn't mark it paid, with one month of history", async () => {
    const run = await twoPlans(["2026-10-07", "2026-10-15", "2026-11-07"]);
    expect(show((await run((s) => billsAndPace(s, "2026-11-08", "2026-11-08", "2026-11-20"))).bills)).toEqual(["2026-11-15 Netflix"]);
  });

  it("or with months of it, when the bank shows both plans: each charge belongs to its own plan", async () => {
    const run = await twoPlans(["2026-08-07", "2026-08-15", "2026-09-07", "2026-09-15", "2026-10-07", "2026-10-15", "2026-11-07"]);
    // The tracked plan is still due on the 15th; the other is found in the bank and comes again on Dec 7.
    expect(show((await run((s) => billsAndPace(s, "2026-11-08", "2026-11-08", "2026-12-08"))).bills)).toEqual(["2026-11-15 Netflix", "2026-12-07 Netflix (found)"]);
  });

  it("is paid once its own charge posts", async () => {
    const run = await twoPlans(["2026-10-07", "2026-10-15", "2026-11-07", "2026-11-15"]);
    expect(show((await run((s) => upcomingRecurring(s, "2026-11-15", "2026-12-20"))).map((u) => ({ ...u, found: false })))).toEqual(["2026-12-15 Netflix"]);
  });

  it("with both tracked, the charge for the plan due yesterday doesn't pay the other one too", async () => {
    const run = await twoPlans(["2026-11-07"]);
    await run((s) => createRecurring(s, { name: "Netflix", amountCents: -1_549, frequency: "monthly", nextDueDate: "2026-11-07", kind: "subscription" }));
    expect(show((await run((s) => upcomingRecurring(s, "2026-11-08", "2026-11-20"))).map((u) => ({ ...u, found: false })))).toEqual(["2026-11-15 Netflix"]);
  });
});

describe("review fixes: nothing else hides a bill or the money it costs", () => {
  it("an ordinary Amazon purchase doesn't pay the Amazon Prime renewal", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 100_000);
      await createRecurring(s, { name: "Amazon Prime", amountCents: -1_499, frequency: "monthly", nextDueDate: "2026-11-10", kind: "subscription" });
      await createTransaction(s, { accountId: acct.id, date: "2026-11-06", description: "AMAZON MKTPL*ZX12", merchantName: "Amazon", amountCents: -1_380 });
    });
    const f = await run((s) => cashForecast(s, "2026-11-07", 10));
    expect(f.bills.filter((b) => b.name === "Amazon Prime").map((b) => b.date)).toEqual(["2026-11-10"]);
  });

  it("tracked income from a university doesn't hide the tuition plan paid to it, or its cost", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 100_000);
      for (const d of ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "STATE UNIVERSITY", merchantName: "State University", amountCents: -50_000 });
      for (const [d, c] of [
        ["2026-09-20", 4_100],
        ["2026-10-02", 2_300],
        ["2026-10-21", 7_700],
        ["2026-11-01", 1_900],
      ] as const)
        await createTransaction(s, { accountId: acct.id, date: d, description: "KROGER", merchantName: "Kroger", amountCents: -c });
    });
    const before = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-04"));
    await run((s) => createRecurring(s, { name: "State University", amountCents: 120_000, frequency: "biweekly", nextDueDate: "2026-11-13", kind: "income" }));
    const after = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-04"));
    expect(after.bills).toEqual([expect.objectContaining({ name: "State University", date: "2026-11-15", amountCents: -50_000, found: true })]);
    expect(after.typical).toEqual(before.typical);
  });

  it("a cancelled tracked item's charges still count as spending (only active bills come out of day-to-day)", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 100_000);
      for (const d of ["2026-08-20", "2026-09-20", "2026-10-20"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "NETFLIX.COM", merchantName: "Netflix", amountCents: -1_549 });
      const item = await createRecurring(s, { name: "Netflix", amountCents: -1_549, frequency: "monthly", nextDueDate: "2026-11-20", kind: "subscription" });
      await setRecurringStatus(s, item.id, "cancelled");
    });
    const { bills, typical } = await run((s) => billsAndPace(s, TODAY, TODAY, "2026-12-04"));
    expect(bills).toEqual([]);
    // Sep 20 and Oct 20 fall in the last 8 weeks: $30.98 over the 46 days since Sep 20.
    expect(typical).toEqual({ dailyCents: Math.round(3_098 / 46), basedOnDays: 46 });
  });

  it("rent paid a week early under the bank's own name is paid, not counted again", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s, 300_000);
      for (const d of ["2026-09-01", "2026-10-01", "2026-11-01", "2026-11-24"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "RENT CAMPUS EDGE APTS", amountCents: -120_000 });
      await createRecurring(s, { name: "Rent", amountCents: -120_000, frequency: "monthly", nextDueDate: "2026-12-01", kind: "bill" });
    });
    const { bills } = await run((s) => billsAndPace(s, "2026-11-26", "2026-11-26", "2026-12-31"));
    expect(bills.map((b) => `${b.name}@${b.date} ${b.found}`)).toEqual([]);
    const next = await run((s) => billsAndPace(s, "2026-11-26", "2026-11-26", "2027-01-05"));
    expect(next.bills.map((b) => `${b.name}@${b.date} ${b.found}`)).toEqual(["Rent@2027-01-01 false"]);
  });
});
