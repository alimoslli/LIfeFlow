import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { billsAndPace, cashForecast } from "@/server/services/finance/forecast";
import { createRecurring, suggestRecurring } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { makeUser } from "../helpers";

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
