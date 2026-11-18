import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { billsAndPace } from "@/server/services/finance/forecast";
import { settleOwnMoves } from "@/server/services/finance/own-moves";
import { createTransaction } from "@/server/services/finance/transactions";
import type { TransactionKind } from "@/server/db/schema";
import { makeUser } from "../helpers";

/** The person's own money moved between their accounts is never spending and income (owner, 2026-11-18). */
afterAll(closeDb);
const TODAY = "2026-11-18";

async function setUp(s: UserScope) {
  const chase = await createManualAccount(s, { name: "Chase", type: "depository", subtype: "checking", currentBalanceCents: 200_000 });
  const boa = await createManualAccount(s, { name: "BofA", type: "depository", subtype: "checking", currentBalanceCents: 50_000 });
  const add = (accountId: string, date: string, description: string, amountCents: number, kind: TransactionKind) =>
    createTransaction(s, { accountId, date, description, amountCents, kind });
  return { chase, boa, add };
}
const kinds = (s: UserScope) =>
  s.tx
    .select({ d: transactions.description, kind: transactions.kind })
    .from(transactions)
    .where(eq(transactions.userId, s.userId))
    .then((rows) => Object.fromEntries(rows.map((r) => [r.d, r.kind])));

describe("own-account moves", () => {
  it("pairs a Zelle out of one bank with the same amount into another within 3 days: both are their own transfer", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { chase, boa, add } = await setUp(s);
      await add(chase.id, "2026-11-10", "ZELLE TO SELF BOA 1", -40_000, "transfer");
      await add(boa.id, "2026-11-12", "ZELLE FROM SELF CHASE 1", 40_000, "income");
      // a near miss: a different amount is someone else's money, still income
      await add(chase.id, "2026-11-03", "ZELLE TO ALEX R", -25_000, "transfer");
      await add(boa.id, "2026-11-04", "ZELLE FROM MOM", 30_000, "income");
      // too far apart to be one move
      await add(chase.id, "2026-10-01", "ZELLE TO SAM K", -10_000, "transfer");
      await add(boa.id, "2026-10-08", "ZELLE FROM SAM K", 10_000, "income");
      expect(await settleOwnMoves(s, TODAY)).toBe(1);
      expect(await kinds(s)).toEqual({
        "ZELLE TO SELF BOA 1": "transfer",
        "ZELLE FROM SELF CHASE 1": "transfer",
        "ZELLE TO ALEX R": "transfer",
        "ZELLE FROM MOM": "income",
        "ZELLE TO SAM K": "transfer",
        "ZELLE FROM SAM K": "income",
      });
      // safe to run again
      expect(await settleOwnMoves(s, TODAY)).toBe(0);
    });
  });

  it("usual spending leaves out the move and a PayPal top-up, but still counts a real payment to a friend", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const { chase, boa, add } = await setUp(s);
      const d = addDaysStr(TODAY, -10);
      await add(chase.id, d, "ZELLE TO SELF BOA 2", -50_000, "transfer");
      await add(boa.id, addDaysStr(d, 1), "ZELLE FROM SELF CHASE 2", 50_000, "income");
      await add(chase.id, d, "PAYPAL ADD MONEY FROM BANK", -20_000, "expense");
      await add(chase.id, addDaysStr(TODAY, -20), "VENMO PAYMENT TO JORDAN M", -5_600, "transfer");
      await settleOwnMoves(s, TODAY);
      const { typical } = await billsAndPace(s, TODAY, TODAY, addDaysStr(TODAY, 30));
      // only the $56 to Jordan, over the 20 days the feed covers
      expect(typical).toEqual({ dailyCents: Math.round(5_600 / 20), basedOnDays: 20 });
      expect((await kinds(s))["PAYPAL ADD MONEY FROM BANK"]).toBe("transfer");
    });
  });
});
