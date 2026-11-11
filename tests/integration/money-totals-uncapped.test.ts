import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { cashflowFor, moneyOverview } from "@/server/services/finance/overview";
import { budgetStatus, setBudget, spendingByCategory } from "@/server/services/finance/planning";
import { spendingSummary } from "@/server/services/finance/insights";
import { cashflowOverQuery, queryAllTransactions, queryTransactions } from "@/server/services/finance/transactions";
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
    expect((await run((s) => cashflowOverQuery(s, { from: "2026-10-01", to: "2026-10-31", includeExcluded: true }))).netSpendingCents).toBe(500_100);
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
    // The row-based rules give the same answer as the SQL ones.
    const viaRows = await run((s) => cashflowOverQuery(s, { from: "2026-10-01", to: "2026-10-31" }));
    expect(viaRows).toMatchObject({ netSpendingCents: expectedSpend, incomeCents: 300_000, transactionCount: 606, pendingCount: 1 });
  }, 60_000);
});
