import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTask } from "@/server/services/tasks";
import { tonight } from "@/server/services/tonight";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("tonight: the next 24 hours from the person's own records", () => {
  it("lists what is due, takes the free hours down by what's booked, and shows what a plan costs", async () => {
    const { run } = await makeUser();
    // Thursday 6 PM in New York.
    const now = new Date("2026-11-12T23:00:00Z");
    await run(async (s) => {
      await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 4100 });
      await createTask(s, TZ, { title: "Email Prof. Lee", dueDate: "2026-11-12", dueTime: "21:00" });
    });
    const r = await run((s) => tonight(s, TZ, now, { includeMoney: true, plan: { label: "dinner out", spendCents: 2500, hours: 3 } }));
    expect(r.due.map((d) => d.what)).toEqual(["Email Prof. Lee"]);
    expect(r.freeMinutes).toBe(5 * 60); // 6 PM to 11 PM, nothing booked
    expect(r.cash).toMatchObject({ cashCents: 4100 });
    expect(r.tradeoff).toMatchObject({
      label: "dinner out",
      freeMinutesAfter: 2 * 60,
      overFreeTime: false,
      leftAfterBillsAfterCents: 1600,
      wouldDipBelowZero: false,
      itemsStillDue: 1,
    });
    // The same plan that doesn't fit says so.
    const big = await run((s) => tonight(s, TZ, now, { includeMoney: true, plan: { spendCents: 9000, hours: 6 } }));
    expect(big.tradeoff).toMatchObject({ overFreeTime: true, wouldDipBelowZero: true });
  });

  it("leaves money out when it is locked, and states what it assumes", async () => {
    const { run } = await makeUser();
    const r = await run((s) => tonight(s, TZ, new Date("2026-11-12T23:00:00Z"), { includeMoney: false, plan: { spendCents: 2500 } }));
    expect(r.cash).toBeNull();
    expect(r.tradeoff?.leftAfterBillsAfterCents).toBeNull();
    expect(r.assumes).toMatch(/Money is locked/);
    expect(r.assumes).toMatch(/23:00/);
  });
});
