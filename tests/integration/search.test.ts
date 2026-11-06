import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { searchEverything } from "@/server/services/search";
import { createTask } from "@/server/services/tasks";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction } from "@/server/services/finance/transactions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("search as you type", () => {
  it("finds things from the first letter (start of a word), and anywhere from two letters", async () => {
    const u = await makeUser();
    await u.run(async (s) => {
      await createTask(s, TZ, { title: "Gym with Sam" });
      await createTask(s, TZ, { title: "Pay rent" });
      await createTask(s, TZ, { title: "Laundry" });
    });
    const one = await u.run((s) => searchEverything(s, "g"));
    expect(one.map((h) => h.title)).toContain("Gym with Sam");
    expect(one.map((h) => h.title)).not.toContain("Laundry"); // "g" isn't the start of a word there
    const sam = await u.run((s) => searchEverything(s, "s"));
    expect(sam.map((h) => h.title)).toContain("Gym with Sam"); // start of the second word
    const two = await u.run((s) => searchEverything(s, "un"));
    expect(two.map((h) => h.title)).toContain("Laundry"); // two letters match anywhere
    expect(await u.run((s) => searchEverything(s, "  "))).toEqual([]);
  });

  it("leaves money out while the Money lock is on", async () => {
    const u = await makeUser();
    await u.run(async (s) => {
      const acc = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 10_000 });
      await createTransaction(s, { accountId: acc.id, date: "2026-11-01", description: "ZELLE TO OMAR MOUSSELLI", amountCents: -4_000 });
      await createTask(s, TZ, { title: "Omar's birthday" });
    });
    const open = await u.run((s) => searchEverything(s, "omar"));
    expect(open.some((h) => h.kind === "transaction")).toBe(true);
    const locked = await u.run((s) => searchEverything(s, "omar", 5, { moneyLocked: true }));
    expect(locked.some((h) => h.kind === "transaction" || h.kind === "goal")).toBe(false);
    expect(locked.map((h) => h.title)).toContain("Omar's birthday");
  });
});
