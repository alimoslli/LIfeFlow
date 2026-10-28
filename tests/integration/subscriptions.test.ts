import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { tasks } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createRecurring } from "@/server/services/finance/planning";
import { billedVia, remindBeforeRenewal, subscriptionsOverview, trackFound, updateSubscription } from "@/server/services/finance/subscriptions";
import { createTransaction } from "@/server/services/finance/transactions";
import { runProactive } from "@/server/services/proactive/engine";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const today = todayIn(TZ);

describe("subscription finder", () => {
  it("totals subscriptions and flags price increases, duplicate services, ending trials and unused ones", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Card", type: "credit", currentBalanceCents: 0 });
      const charge = (name: string, cents: number, daysAgo: number, desc = name) =>
        createTransaction(s, { accountId: acct.id, date: addDaysStr(today, -daysAgo), description: desc, merchantName: name, amountCents: -cents });
      for (const [i, c] of [1099, 1099, 1199].entries()) await charge("Spotify", c, 60 - i * 30);
      for (const d of [65, 35, 5]) await charge("Netflix", 1549, d);
      for (const d of [62, 32, 2]) await charge("Hulu", 999, d, "APPLE.COM/BILL HULU");
      for (const d of [61, 31, 1]) await charge("Gym Pass", 2500, d);
      await createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: addDaysStr(today, 10), kind: "subscription" });
      await createRecurring(s, { name: "Netflix", amountCents: -1549, frequency: "monthly", nextDueDate: addDaysStr(today, 25), kind: "subscription" });
      const hulu = await createRecurring(s, {
        name: "Hulu",
        amountCents: -999,
        frequency: "monthly",
        nextDueDate: addDaysStr(today, 28),
        kind: "subscription",
      });
      await updateSubscription(s, hulu.id, { trialEndsOn: addDaysStr(today, 2) });
      const rent = await createRecurring(s, { name: "Rent", amountCents: -90_000, frequency: "monthly", nextDueDate: addDaysStr(today, 5), kind: "bill" });
      expect(rent.kind).toBe("bill");
    });
    const o = await run((s) => subscriptionsOverview(s, today));
    expect(o.monthlyCents).toBe(1199 + 1549 + 999); // rent never counts
    expect(o.yearlyCents).toBe((1199 + 1549 + 999) * 12);
    expect(o.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "price_up", name: "Spotify", fromCents: 1099, toCents: 1199, yearlyExtraCents: 1200 }),
        expect.objectContaining({ kind: "trial", name: "Hulu", daysLeft: 2 }),
        expect.objectContaining({ kind: "duplicate", family: "video streaming", names: expect.arrayContaining(["Netflix", "Hulu"]) }),
      ]),
    );
    expect(o.subscriptions.find((x) => x.name === "Hulu")!.via).toBe("apple");
    expect(o.found.map((f) => f.name)).toContain("Gym Pass");

    // Jarvis speaks up about the price increase and the trial; the trial is urgent.
    const msgs = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "midday" }));
    expect(msgs.find((m) => m.kind === "subscription_price_up")!.body).toContain("Spotify went from $10.99 to $11.99, $12 more a year");
    expect(msgs.find((m) => m.kind === "trial_ending")!.urgent).toBe(true);

    // Track the one found in transactions; remind before a renewal.
    const gym = o.found.find((f) => f.name === "Gym Pass")!;
    await run((s) => trackFound(s, today, gym.merchantKey));
    expect((await run((s) => subscriptionsOverview(s, today))).subscriptions.map((x) => x.name)).toContain("Gym Pass");
    const spotify = o.subscriptions.find((x) => x.name === "Spotify")!;
    const r = await run((s) => remindBeforeRenewal(s, TZ, spotify.id, 3, today));
    expect(r.day).toBe(addDaysStr(today, 7));
    expect((await run((s) => s.tx.select().from(tasks))).map((t) => t.title)[0]).toMatch(/^Spotify renews .* keep or cancel\?$/);

    await run((s) => updateSubscription(s, spotify.id, { usage: "not_using" }));
    expect((await run((s) => subscriptionsOverview(s, today))).flags).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "unused", name: "Spotify" })]),
    );
    expect(billedVia("GOOGLE *YouTube Premium")).toBe("google_play");
  });
});
