import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { billsAndPace, cashForecast } from "@/server/services/finance/forecast";
import { createRecurring, listRecurring, suggestRecurring } from "@/server/services/finance/planning";
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
      // Tracked at $82; the bank took $69.06 today.
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
});
