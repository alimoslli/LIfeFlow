import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { makeToolContext } from "@/server/jarvis/agent";
import { executeToolCall } from "@/server/jarvis/executor";
import { createManualAccount } from "@/server/services/finance/accounts";
import { SEARCH_PAGE, createTransaction, findTransactions, queryTransactions, updateTransaction } from "@/server/services/finance/transactions";
import { spendingSummary } from "@/server/services/finance/insights";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

async function bank(lines: { daysAgo: number; description: string; cents: number; merchant?: string | null; notes?: string }[]) {
  const u = await makeUser("Search Tester");
  await u.run(async (s) => {
    const acct = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 100000 });
    for (const l of lines) {
      const t = await createTransaction(s, { accountId: acct.id, date: daysAgo(l.daysAgo), description: l.description, amountCents: -l.cents });
      // The vendor tidy writes the clean name afterwards.
      if (l.merchant || l.notes) await updateTransaction(s, t.id, { ...(l.merchant && { merchantName: l.merchant }), ...(l.notes && { notes: l.notes }) });
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

  it("through the skyling tool: the newest row is first", async () => {
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

type ToolData = {
  matchType: string;
  count: number;
  note?: string;
  closestPayments?: { description: string }[];
  transactions: { description: string; sure: boolean }[];
};
const tool = async (u: Awaited<ReturnType<typeof bank>>, args: object) =>
  ((await executeToolCall("query_transactions", JSON.stringify(args), makeToolContext(session(u), crypto.randomUUID()), "p")) as { result: { data: ToolData } })
    .result.data;

describe("review fixes", () => {
  it("H1: a search with no usable word never turns into 'everything'", async () => {
    const u = await bank([
      { daysAgo: 3, description: "ZELLE TO DANA REYES 77120", cents: 1800 },
      { daysAgo: 2, description: "KROGER 331", cents: 6100 },
    ]);
    for (const q of ["Омар", "محمد", "Zelle 李明", "Zelle J"]) {
      const d = await tool(u, { search: q });
      expect(d.count, q).toBe(0);
      expect(d.matchType, q).toBe("none");
    }
    const hit = await bank([{ daysAgo: 3, description: "ZELLE TO Омар К 1", cents: 500 }]);
    expect((await tool(hit, { search: "Омар" })).count).toBe(1);
    expect((await tool(u, { search: "Zelle" })).count).toBe(1);
  });

  it("H2/M1: sibling names and initials are never stated as sure", async () => {
    const u = await bank([
      { daysAgo: 3, description: "ZELLE TO SAMIRA HADDAD 1234", cents: 1800 },
      { daysAgo: 5, description: "ZELLE TO JOHN M 4412", cents: 2500 },
      { daysAgo: 6, description: "ZELLE TO OMAR O'BRIEN", cents: 700 },
    ]);
    const samir = await tool(u, { search: "Zelle Samir Haddad" });
    expect(samir.transactions.every((t) => !t.sure)).toBe(true);
    expect(samir.matchType).toBe("similar");
    const john = await tool(u, { search: "John Mousselli" });
    expect(john.transactions.map((t) => [t.description, t.sure])).toEqual([["ZELLE TO JOHN M 4412", false]]);
    expect(john.matchType).toBe("similar");
    expect((await tool(u, { search: "Omar Ozturk" })).count).toBe(0);
    const owner = await bank([
      { daysAgo: 10, description: "ZELLE TO MOUSSELLI OMAR 1", cents: 1500 },
      { daysAgo: 20, description: "ZELLE TO OMAR MOUSSEL", cents: 1000 },
    ]);
    const o = await tool(owner, { search: "Omar Mousselli" });
    expect(o.matchType).toBe("exact");
    expect(o.transactions.map((t) => t.sure)).toEqual([true, false]);
    expect(o.note).toMatch(/sure:false/);
  });

  it("M2: a bare Cash App search finds the row", async () => {
    const u = await bank([{ daysAgo: 3, description: "CASH APP*DANA LEE*", cents: 1800 }]);
    const d = await tool(u, { search: "Cash App" });
    expect(d.matchType).toBe("exact");
    expect(d.count).toBe(1);
  });

  it("M4: totals count the same people the lookup does", async () => {
    const u = await bank([
      { daysAgo: 3, description: "ZELLE TO MOUSSELLI OMAR 1", cents: 4000 },
      { daysAgo: 5, description: "Zelle payment to Omar Mousselli", cents: 2500 },
      { daysAgo: 6, description: "ZELLE TO OMAR MOUSSEL", cents: 900 }, // shortened: found by the lookup, not in totals
    ]);
    expect(await u.run((s) => queryTransactions(s, { search: "Omar Mousselli" }))).toHaveLength(3);
    const sum = await u.run((s) => spendingSummary(s, { from: daysAgo(30), to: daysAgo(0), search: "Omar Mousselli" }));
    expect(sum.netSpendingCents).toBe(6500);
  });

  it("L1: old real matches survive many newer rows that share the first letters", async () => {
    const u = await bank([
      { daysAgo: 400, description: "ZELLE TO DARIUS KOWALSKI", cents: 1000 },
      ...Array.from({ length: 1100 }, (_, i) => ({ daysAgo: 1 + (i % 300), description: `DARTS CLUB ${i}`, cents: 100 })),
    ]);
    const rows = await u.run((s) => queryTransactions(s, { search: "Darius Kowalski" }));
    expect(rows.map((r) => r.description)).toEqual(["ZELLE TO DARIUS KOWALSKI"]);
  }, 60_000);

  it("L2: accents in stored text and letters like ł are found", async () => {
    const u = await bank([
      { daysAgo: 3, description: "CAFE 12", cents: 1800, merchant: "Café Rio" },
      { daysAgo: 4, description: "ZELLE 9", cents: 500, notes: "rent to José" },
      { daysAgo: 5, description: "ZELLE TO ŁUKASZ NOWAK", cents: 500 },
    ]);
    expect((await tool(u, { search: "Cafe Rio" })).count).toBe(1);
    expect((await tool(u, { search: "Jose" })).count).toBe(1);
    expect((await tool(u, { search: "José" })).count).toBe(1);
    expect((await tool(u, { search: "Lukasz Nowak" })).count).toBe(1);
  });

  it("L3: closest payments drop unrelated rows once something partly matched", async () => {
    const u = await bank([
      { daysAgo: 3, description: "ZELLE TO OMAR HADDAD 5", cents: 500 },
      { daysAgo: 2, description: "PAYPAL *SPOTIFY", cents: 999 },
    ]);
    const r = await u.run((s) => findTransactions(s, { search: "Zelle Omar Mousselli" }));
    expect(r.match).toBe("none");
    expect(r.closest.map((x) => x.description)).toEqual(["ZELLE TO OMAR HADDAD 5"]);
  });
});

describe("second review fixes", () => {
  it("M1: keyset paging returns every row once, in order, even when many share a date and creation time", async () => {
    // One transaction inserts them all, so date and created_at tie across pages: only the id breaks the tie.
    const n = SEARCH_PAGE * 2 + 300;
    const u = await bank(Array.from({ length: n }, (_, i) => ({ daysAgo: 1 + Math.floor(i / 500), description: `ZELLE TO DANA REYES ${i}`, cents: 100 + i })));
    const paged = await u.run((s) => queryTransactions(s, { search: "Dana Reyes", limit: 5000 }));
    const plain = await u.run((s) => queryTransactions(s, { search: "Dana Reyes", phrase: true, limit: 5000 }));
    expect(paged).toHaveLength(n);
    expect(new Set(paged.map((r) => r.id)).size).toBe(n);
    expect(paged.map((r) => r.id)).toEqual(plain.map((r) => r.id));
    // A row added after the first read (a sync) shows up once and moves nothing else.
    await u.run(async (s) => {
      const acct = (await s.tx.query.financialAccounts.findFirst())!;
      await createTransaction(s, { accountId: acct.id, date: daysAgo(0), description: "ZELLE TO DANA REYES NEW", amountCents: -1 });
    });
    const after = await u.run((s) => queryTransactions(s, { search: "Dana Reyes", limit: 5000 }));
    expect(after).toHaveLength(n + 1);
    expect(new Set(after.map((r) => r.id)).size).toBe(n + 1);
  }, 120_000);

  it("L1: totals report the unconfirmed amount apart", async () => {
    const u = await bank([
      { daysAgo: 3, description: "ZELLE TO MOUSSELLI OMAR 1", cents: 4000 },
      { daysAgo: 6, description: "ZELLE TO OMAR MOUSSEL", cents: 5000 },
      { daysAgo: 7, description: "ZELLE TO OMAR M 4412", cents: 3500 },
    ]);
    const sum = await u.run((s) => spendingSummary(s, { from: daysAgo(30), to: daysAgo(0), search: "Omar Mousselli" }));
    expect(sum.netSpendingCents).toBe(4000);
    expect(sum.unconfirmed).toEqual({ count: 2, cents: 8500 });
    const none = await u.run((s) => spendingSummary(s, { from: daysAgo(30), to: daysAgo(0) }));
    expect(none.unconfirmed).toEqual({ count: 0, cents: 0 });
  });

  it("L2: a curly apostrophe or backtick in stored text is ignored like the straight one", async () => {
    const u = await bank([
      { daysAgo: 3, description: "RISTORANTE 1", cents: 1800, notes: "dinner at L\u2019Osteria" },
      { daysAgo: 4, description: "ZELLE 2", cents: 500, notes: "to O`Brien" },
    ]);
    expect((await tool(u, { search: "Osteria" })).count).toBe(0); // joined word is "losteria"
    expect((await tool(u, { search: "L'Osteria" })).count).toBe(1);
    expect((await tool(u, { search: "OBrien" })).count).toBe(1);
  });

  it("L3: Nichola is not sure to be Nicholas", async () => {
    const u = await bank([{ daysAgo: 3, description: "ZELLE TO NICHOLAS ROSS 9", cents: 500 }]);
    const d = await tool(u, { search: "Nichola Ross" });
    expect(d.transactions.map((t) => t.sure)).toEqual([false]);
    expect(d.matchType).toBe("similar");
  });
});

describe("totals and lookups agree (mission 0a62c1cb)", () => {
  const range = () => ({ from: daysAgo(400), to: daysAgo(0) });

  it("'how much did I Zelle Omar in total' counts what 'when did I last Zelle Omar' finds, and names it", async () => {
    const u = await bank([
      { daysAgo: 100, description: "ZELLE TO OMAR HADDAD 1", cents: 10000, merchant: "Omar Haddad" },
      { daysAgo: 80, description: "ZELLE TO OMAR HADDAD 2", cents: 5000, merchant: "Omar Haddad" },
      { daysAgo: 60, description: "OMAR H ZELLE", cents: 9000 },
      { daysAgo: 40, description: "ZELLE TO OMAR HADDAD 3", cents: 100 },
    ]);
    const found = await u.run((s) => queryTransactions(s, { search: "Zelle Omar" }));
    const sum = await u.run((s) => spendingSummary(s, { ...range(), search: "Zelle Omar" }));
    expect(sum.netSpendingCents).toBe(found.reduce((n, r) => n - r.amountCents, 0));
    expect(sum.netSpendingCents).toBe(24100);
    expect(sum.countedNames).toEqual([
      { name: "Omar Haddad", count: 2, paidCents: 15000, receivedCents: 0 },
      { name: "OMAR H ZELLE", count: 1, paidCents: 9000, receivedCents: 0 },
      { name: "ZELLE TO OMAR HADDAD 3", count: 1, paidCents: 100, receivedCents: 0 },
    ]);
    // Through the tool: dollars, same list.
    const out = (await executeToolCall(
      "spending_summary",
      JSON.stringify({ ...range(), search: "Zelle Omar" }),
      makeToolContext(session(u), crypto.randomUUID()),
      "t1",
    )) as {
      result: { ok: boolean; data: { countedNames: { name: string; count: number; paid: number }[] } };
    };
    expect(out.result.ok).toBe(true);
    expect(out.result.data.countedNames.map((n) => [n.name, n.count, n.paid])).toEqual([
      ["Omar Haddad", 2, 150],
      ["OMAR H ZELLE", 1, 90],
      ["ZELLE TO OMAR HADDAD 3", 1, 1],
    ]);
  });

  it("a different person with a similar name is never merged into the total", async () => {
    const u = await bank([
      { daysAgo: 10, description: "ZELLE TO OMAR HADDAD", cents: 4000 },
      { daysAgo: 9, description: "ZELLE TO OMAR HADID", cents: 7000 },
      { daysAgo: 8, description: "ZELLE TO OMAR M 1", cents: 3000 },
    ]);
    const sum = await u.run((s) => spendingSummary(s, { ...range(), search: "Omar Haddad" }));
    expect(sum.netSpendingCents).toBe(4000);
    expect(sum.countedNames.map((n) => n.name)).toEqual(["ZELLE TO OMAR HADDAD"]);
    expect(JSON.stringify(sum.countedNames)).not.toMatch(/HADID|OMAR M/);
  });

  it("no search means no names list; Money lock still covers the tool", async () => {
    const u = await bank([{ daysAgo: 4, description: "ZELLE TO OMAR HADDAD", cents: 1000 }]);
    expect((await u.run((s) => spendingSummary(s, range()))).countedNames).toEqual([]);
    const locked = makeToolContext(session(u), crypto.randomUUID(), new Date(), "", true);
    const out = (await executeToolCall("spending_summary", JSON.stringify({ ...range(), search: "Omar" }), locked, "t2")) as {
      result: { ok: boolean; error: string };
    };
    expect(out.result.ok).toBe(false);
    expect(out.result.error).toMatch(/Money is locked/);
  });
});
