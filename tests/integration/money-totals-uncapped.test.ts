import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { cashflowFor, moneyOverview } from "@/server/services/finance/overview";
import { budgetStatus, setBudget, spendingByCategory } from "@/server/services/finance/planning";
import { spendingSummary } from "@/server/services/finance/insights";
import { queryAllTransactions, queryTransactions } from "@/server/services/finance/transactions";
import { cashflowTotals, flowTotals } from "@/server/services/finance/totals";
import { roundUps } from "@/server/services/finance/coach";
import { resolvePeriod } from "@/lib/periods";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TODAY = "2026-10-28";

type Kind = "expense" | "income" | "transfer" | "refund" | "reimbursement";
async function seed(n: number, extra: { kind: Kind; amountCents: number; pending?: boolean; excluded?: boolean; count?: number }[] = []) {
  const { run } = await makeUser();
  const ids = await run(async (s) => {
    const acct = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 0 });
    const groceries = (await getCategoryByName(s, "Groceries"))!;
    const mk = (i: number, o: { kind: Kind; amountCents: number; pending?: boolean; excluded?: boolean }) => ({
      userId: s.userId,
      accountId: acct.id,
      date: `2026-10-${String(1 + (i % 27)).padStart(2, "0")}`,
      description: `Row ${i}`,
      categoryId: groceries.id,
      pending: false,
      excluded: false,
      ...o,
    });
    const rows = Array.from({ length: n }, (_, i) => mk(i, { kind: "expense", amountCents: -100 }));
    for (const e of extra) for (let k = 0; k < (e.count ?? 1); k++) rows.push(mk(n + rows.length, e));
    for (let i = 0; i < rows.length; i += 5000) await s.tx.insert(transactions).values(rows.slice(i, i + 5000));
    await setBudget(s, { month: TODAY, categoryId: groceries.id, limitCents: 10_000_000 });
    return { groceries: groceries.id };
  });
  return { run, ...ids };
}

describe("totals cover every row, not the first 500 or 5,000", () => {
  for (const n of [500, 501, 5000, 5001]) {
    it(`${n} one-dollar expenses add up exactly in Budgets, Money and the category rollup`, async () => {
      const { run } = await seed(n);
      const o = await run((s) => moneyOverview(s, TODAY));
      expect(o.month.netSpendingCents).toBe(n * 100);
      expect(o.month.transactionCount).toBe(n);
      expect(o.budgets.items[0].spentCents).toBe(n * 100);
      expect(o.budgets.budgetedSpentCents).toBe(n * 100);
      expect((await run((s) => budgetStatus(s, TODAY)))[0].spentCents).toBe(n * 100);
      expect((await run((s) => spendingByCategory(s, "2026-10-01", "2026-10-31")))[0].cents).toBe(n * 100);
      expect((await run((s) => cashflowFor(s, resolvePeriod("month", TODAY)))).netSpendingCents).toBe(n * 100);
    }, 60_000);
  }

  it("the row-based readers (summaries, uncapped reads, page totals) see all 5,001 rows too", async () => {
    const { run } = await seed(5001);
    expect((await run((s) => queryAllTransactions(s, { from: "2026-10-01", to: "2026-10-31" }))).length).toBe(5001);
    expect((await run((s) => spendingSummary(s, { from: "2026-10-01", to: "2026-10-31" }))).netSpendingCents).toBe(500_100);
    expect((await run((s) => cashflowTotals(s, { from: "2026-10-01", to: "2026-10-31", includeExcluded: true }))).netSpendingCents).toBe(500_100);
    // A list asked for with no limit is still a page, not a total.
    expect((await run((s) => queryTransactions(s, { from: "2026-10-01", to: "2026-10-31" }))).length).toBe(500);
  }, 60_000);

  it("transfers, refunds, reimbursements, pending and hidden rows are treated as before", async () => {
    const { run } = await seed(600, [
      { kind: "transfer", amountCents: -50_000 },
      { kind: "transfer", amountCents: 50_000 },
      { kind: "refund", amountCents: 2_500 },
      { kind: "reimbursement", amountCents: 1_000 },
      { kind: "income", amountCents: 300_000 },
      { kind: "expense", amountCents: -700, pending: true },
      { kind: "expense", amountCents: -9_999, excluded: true },
      { kind: "income", amountCents: 8_888, excluded: true },
    ]);
    const expectedSpend = 600 * 100 + 700 - 2_500 - 1_000; // pending counts; hidden and transfers don't
    const o = await run((s) => moneyOverview(s, TODAY));
    expect(o.month).toMatchObject({ netSpendingCents: expectedSpend, incomeCents: 300_000, transactionCount: 600 + 6, pendingCount: 1 });
    expect(o.budgets.items[0].spentCents).toBe(expectedSpend); // all in Groceries, refunds offset it
    // The same totals through the Transactions page path (hidden rows are counted apart).
    const viaRows = await run((s) => cashflowTotals(s, { from: "2026-10-01", to: "2026-10-31" }));
    expect(viaRows).toMatchObject({ netSpendingCents: expectedSpend, incomeCents: 300_000, transactionCount: 606, pendingCount: 1, excludedCount: 2 });
  }, 60_000);

  it("never returns a negative zero: income-only month, and expense and refund that cancel", async () => {
    const { run } = await seed(0, [{ kind: "income", amountCents: 5_000 }]);
    const o = await run((s) => moneyOverview(s, TODAY));
    expect(Object.is(o.month.netSpendingCents, 0)).toBe(true);
    expect(o.month.incomeCents).toBe(5_000);
    expect(Object.is(o.month.netCashflowCents, 5_000)).toBe(true);
    expect(Object.is((await run((s) => cashflowTotals(s, { from: "2026-10-01", to: "2026-10-31" }))).netSpendingCents, 0)).toBe(true);

    const c = await seed(0, [
      { kind: "expense", amountCents: -4_000 },
      { kind: "refund", amountCents: 4_000 },
    ]);
    const byCat = await c.run((s) => spendingByCategory(s, "2026-10-01", "2026-10-31"));
    expect(byCat).toEqual([]); // a category netting to zero is not listed
    const status = await c.run((s) => budgetStatus(s, TODAY));
    expect(Object.is(status[0].spentCents, 0)).toBe(true);
    expect(Object.is(status[0].remainingCents, 10_000_000)).toBe(true);
    expect(Object.is((await c.run((s) => cashflowTotals(s, { from: "2026-10-01", to: "2026-10-31" }))).netSpendingCents, 0)).toBe(true);
    const empty = await seed(0);
    expect(Object.is((await empty.run((s) => cashflowTotals(s, { from: "2026-10-01", to: "2026-10-31" }))).netSpendingCents, 0)).toBe(true);
  }, 60_000);

  it("the Transactions page totals follow its filters (kind, category, search, hidden rows) in SQL", async () => {
    const { run, groceries } = await seed(10, [
      { kind: "income", amountCents: 20_000 },
      { kind: "expense", amountCents: -9_999, excluded: true },
    ]);
    const range = { from: "2026-10-01", to: "2026-10-31", includeExcluded: true };
    expect(await run((s) => cashflowTotals(s, { ...range, kinds: ["income"] }))).toMatchObject({
      incomeCents: 20_000,
      netSpendingCents: 0,
      transactionCount: 1,
    });
    expect(await run((s) => cashflowTotals(s, { ...range, categoryIds: [groceries] }))).toMatchObject({ netSpendingCents: 1_000, excludedCount: 1 });
    expect(await run((s) => cashflowTotals(s, { ...range, search: "row 3" }))).toMatchObject({ netSpendingCents: 100, transactionCount: 1 });
    expect(await run((s) => cashflowTotals(s, { ...range, categoryIds: [] }))).toMatchObject({ transactionCount: 0 });
  }, 60_000);

  it("flow sums (weekend split, round-ups) are exact over more than 5,000 rows", async () => {
    const { run } = await seed(5001);
    const range = { from: "2026-10-01", to: "2026-10-31", kinds: ["expense" as const] };
    const [we, wd] = await run(async (s) => [await flowTotals(s, { ...range, weekend: true }), await flowTotals(s, { ...range, weekend: false })]);
    expect(we.outCents + wd.outCents).toBe(500_100);
    expect(we.count + wd.count).toBe(5001);
    expect(we.outCents).toBeGreaterThan(0);
    expect((await run((s) => roundUps(s, "2026-11-15"))).roundUpCents).toBe(0); // $1.00 purchases round up by nothing
  }, 60_000);

  it("an uncapped read is bounded and says so", async () => {
    const { run } = await seed(5001);
    const rows = await run((s) => queryAllTransactions(s, { from: "2026-10-01", to: "2026-10-31" }));
    expect(rows.length).toBe(5001);
    expect(rows.truncated).toBe(false);
  }, 60_000);
});
