import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { makeToolContext } from "@/server/jarvis/agent";
import { executeToolCall } from "@/server/jarvis/executor";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction, findTransactions, queryTransactions, updateTransaction } from "@/server/services/finance/transactions";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

async function bank(lines: { daysAgo: number; description: string; cents: number; merchant?: string | null }[]) {
  const u = await makeUser("Search Tester");
  await u.run(async (s) => {
    const acct = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 100000 });
    for (const l of lines) {
      const t = await createTransaction(s, { accountId: acct.id, date: daysAgo(l.daysAgo), description: l.description, amountCents: -l.cents });
      // The vendor tidy writes the clean name afterwards.
      if (l.merchant) await updateTransaction(s, t.id, { merchantName: l.merchant });
    }
  });
  return u;
}

const session = (u: Awaited<ReturnType<typeof bank>>) => ({
  id: u.user.id,
  email: u.user.email,
  name: u.user.name,
  timezone: TZ,
  accountKind: "standard" as const,
});

describe("forgiving transaction search", () => {
  it("'last time I Zelled Omar Mousselli' finds the newest matching row, however the bank wrote it", async () => {
    const u = await bank([
      { daysAgo: 200, description: "ZELLE TO MOUSSELLI OMAR 12345", cents: 2500 },
      { daysAgo: 90, description: "Zelle payment to OMAR M Conf# x7k2", cents: 4000 },
      { daysAgo: 30, description: "ZELLE TRANSFER CONF 91827 OMAR MOUSSEL", cents: 6000 },
      { daysAgo: 10, description: "ZELLE 55", cents: 1500, merchant: "Zelle to Omar Mousselli" },
      { daysAgo: 5, description: "OMARKET 4412 ATLANTA GA", cents: 900 },
      { daysAgo: 3, description: "ZELLE TO OMAR SMITH 9981", cents: 7000 },
    ]);
    const rows = await u.run((s) => queryTransactions(s, { search: "last time I Zelled Omar Mousselli" }));
    expect(rows.map((r) => r.amountCents)).toEqual([-1500, -6000, -4000, -2500]);
    expect(rows[0].date).toBe(daysAgo(10));
    // The old phrase behaviour is still there.
    expect(await u.run((s) => queryTransactions(s, { search: "Omar Mousselli", phrase: true }))).toHaveLength(1);
    expect(await u.run((s) => queryTransactions(s, { search: "omar", phrase: true }))).toHaveLength(6);
  });

  it("through the assistant tool: the newest row is first", async () => {
    const u = await bank([
      { daysAgo: 40, description: "ZELLE TO MOUSSELLI OMAR 12345", cents: 2500 },
      { daysAgo: 12, description: "Zelle payment to OMAR M Conf# x7k2", cents: 4000 },
    ]);
    const out = await executeToolCall(
      "query_transactions",
      JSON.stringify({ search: "Omar Mousselli", limit: 5 }),
      makeToolContext(session(u), crypto.randomUUID()),
      "c1",
    );
    const r = (out as { result: { ok: boolean; data: { matchType: string; transactions: { date: string; amountCents: number }[] } } }).result;
    expect(r.ok).toBe(true);
    expect(r.data.matchType).toBe("exact");
    expect(r.data.transactions[0]).toMatchObject({ date: daysAgo(12), amount: -40 });
  });

  it("a near spelling is 'similar'; no match offers the closest person-to-person payments", async () => {
    const u = await bank([
      { daysAgo: 20, description: "ZELLE TO O MOUSSELI 4412", cents: 4000 },
      { daysAgo: 8, description: "VENMO PAYMENT 99 DANA LEE", cents: 1200 },
      { daysAgo: 2, description: "KROGER 331", cents: 6100 },
    ]);
    const similar = await u.run((s) => findTransactions(s, { search: "Omar Mousselli" }));
    expect(similar.match).toBe("similar");
    expect(similar.rows.map((r) => r.amountCents)).toEqual([-4000]);

    const none = await u.run((s) => findTransactions(s, { search: "Zelle Priya Raman" }));
    expect(none.match).toBe("none");
    expect(none.rows).toEqual([]);
    expect(none.closest.map((r) => r.description)).toEqual(["VENMO PAYMENT 99 DANA LEE", "ZELLE TO O MOUSSELI 4412"]);

    const out = await executeToolCall(
      "query_transactions",
      JSON.stringify({ search: "Zelle Priya Raman" }),
      makeToolContext(session(u), crypto.randomUUID()),
      "c2",
    );
    const data = (out as { result: { data: { matchType: string; note: string; closestPayments: unknown[] } } }).result.data;
    expect(data.matchType).toBe("none");
    expect(data.closestPayments).toHaveLength(2);
    expect(data.note).toMatch(/Nothing matches/);

    // A missing merchant is not answered with Zelle lines, but still says so plainly.
    const merchant = await u.run((s) => findTransactions(s, { search: "Starbucks" }));
    expect(merchant).toEqual({ match: "none", rows: [], closest: [] });
    const out2 = await executeToolCall("query_transactions", JSON.stringify({ search: "Starbucks" }), makeToolContext(session(u), crypto.randomUUID()), "c4");
    const d2 = (out2 as { result: { data: { matchType: string; note: string; count: number; closestPayments: unknown[] } } }).result.data;
    expect(d2).toMatchObject({ matchType: "none", count: 0 });
    expect(d2.note).toMatch(/Nothing matches "Starbucks"/);
    expect(d2.closestPayments).toEqual([]);
  });

  it("never reads another user's rows", async () => {
    const mine = await bank([{ daysAgo: 4, description: "ZELLE TO OMAR MOUSSELLI", cents: 1000 }]);
    const other = await bank([{ daysAgo: 4, description: "ZELLE TO OMAR MOUSSELLI", cents: 2000 }]);
    const rows = await mine.run((s) => queryTransactions(s, { search: "Omar Mousselli" }));
    expect(rows.map((r) => r.amountCents)).toEqual([-1000]);
    expect(other.user.id).not.toBe(mine.user.id);
  });

  it("a locked Money says so plainly, never 'nothing found'", async () => {
    const u = await bank([{ daysAgo: 4, description: "ZELLE TO OMAR MOUSSELLI", cents: 1000 }]);
    const locked = makeToolContext(session(u), crypto.randomUUID(), new Date(), "", true);
    const out = await executeToolCall("query_transactions", JSON.stringify({ search: "Omar Mousselli" }), locked, "c3");
    const r = (out as { result: { ok: boolean; error: string; data?: unknown } }).result;
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.error).toMatch(/Money is locked/);
    expect(r.error).toMatch(/open the Money tab and unlock/);
    expect(JSON.stringify(r)).not.toMatch(/matchType|closestPayments|"count"/);
  });
});
