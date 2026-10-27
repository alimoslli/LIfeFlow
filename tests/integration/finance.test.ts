import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { affordability, spendingSummary } from "@/server/services/finance/insights";
import { budgetStatus, createRecurring, setBudget, upcomingRecurring } from "@/server/services/finance/planning";
import { createTransaction, importTransactionsCsv, queryTransactions } from "@/server/services/finance/transactions";
import { makeUser } from "../helpers";

afterAll(closeDb);

async function setup() {
  const u = await makeUser();
  const ids = await u.run(async (s) => {
    const checking = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 150000 });
    const savings = await createManualAccount(s, { name: "Savings", type: "depository", currentBalanceCents: 500000 });
    const cat = async (n: string) => (await getCategoryByName(s, n))!.id;
    return { checking: checking.id, savings: savings.id, groceries: await cat("Groceries"), restaurants: await cat("Restaurants"), food: await cat("Food & Dining"), paycheck: await cat("Paycheck"), savingsTransfer: await cat("Savings Transfer") };
  });
  return { ...u, ids };
}

describe("finance", () => {
  it("answers 'how much did I spend on food since Sept 1' without counting transfers", async () => {
    const { run, ids } = await setup();
    await run(async (s) => {
      await createTransaction(s, { accountId: ids.checking, date: "2026-09-02", description: "Trader Joe's", amountCents: -6420, categoryId: ids.groceries });
      await createTransaction(s, { accountId: ids.checking, date: "2026-09-15", description: "Chipotle", amountCents: -1385, categoryId: ids.restaurants });
      await createTransaction(s, { accountId: ids.checking, date: "2026-09-16", description: "Chipotle refund", amountCents: 1385, categoryId: ids.restaurants });
      await createTransaction(s, { accountId: ids.checking, date: "2026-08-30", description: "Old groceries", amountCents: -5000, categoryId: ids.groceries });
      await createTransaction(s, { accountId: ids.checking, date: "2026-09-20", description: "To savings", amountCents: -20000, categoryId: ids.savingsTransfer });
      await createTransaction(s, { accountId: ids.savings, date: "2026-09-20", description: "From checking", amountCents: 20000, categoryId: ids.savingsTransfer });
      await createTransaction(s, { accountId: ids.checking, date: "2026-09-30", description: "Payroll", amountCents: 120000, categoryId: ids.paycheck });
    });
    const food = await run((s) => spendingSummary(s, { from: "2026-09-01", to: "2026-10-26", categoryName: "food & dining" }));
    expect(food.netSpendingCents).toBe(6420);
    expect(food.refundsCents).toBe(1385);
    expect(food.incomeCents).toBe(0);
    const all = await run((s) => spendingSummary(s, { from: "2026-09-01", to: "2026-10-26" }));
    expect(all.incomeCents).toBe(120000);
    expect(all.netSpendingCents).toBe(6420);
    expect(all.transfersOutCents).toBe(20000);
    expect(all.topCategories[0]).toMatchObject({ name: "Food & Dining", cents: 6420 });
  });

  it("imports CSV idempotently, keeping same-day identical purchases distinct", async () => {
    const { run, ids } = await setup();
    const csv = [
      "Date,Description,Amount,Category",
      "10/01/2026,Starbucks,-5.25,Coffee",
      "10/01/2026,Starbucks,-5.25,Coffee",
      "2026-10-02,Paycheck ACME,1200.00,Paycheck",
      "bad,row,x",
    ].join("\n");
    const first = await run((s) => importTransactionsCsv(s, ids.checking, csv));
    expect(first).toMatchObject({ imported: 3, duplicates: 0 });
    expect(first.errors).toHaveLength(1);
    const second = await run((s) => importTransactionsCsv(s, ids.checking, csv));
    expect(second).toMatchObject({ imported: 0, duplicates: 3 });
    const rows = await run((s) => queryTransactions(s, { accountId: ids.checking }));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.description === "Paycheck ACME")!.kind).toBe("income");
    expect(rows.filter((r) => r.categoryName === "Coffee")).toHaveLength(2);
  });

  it("tracks budgets including subcategories", async () => {
    const { run, ids } = await setup();
    await run(async (s) => {
      await setBudget(s, { month: "2026-10-01", categoryId: ids.food, limitCents: 30000 });
      await createTransaction(s, { accountId: ids.checking, date: "2026-10-05", description: "Groceries", amountCents: -12000, categoryId: ids.groceries });
      await createTransaction(s, { accountId: ids.checking, date: "2026-10-06", description: "Dinner", amountCents: -9000, categoryId: ids.restaurants });
    });
    const [b] = await run((s) => budgetStatus(s, "2026-10-15"));
    expect(b).toMatchObject({ categoryName: "Food & Dining", spentCents: 21000, remainingCents: 9000, percent: 70 });
  });

  it("projects upcoming bills and affordability", async () => {
    const { run } = await setup();
    await run((s) => createRecurring(s, { name: "Rent", amountCents: -90000, frequency: "monthly", nextDueDate: "2026-11-01", kind: "bill" }));
    await run((s) => createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: "2026-10-15", kind: "subscription" }));
    const upcoming = await run((s) => upcomingRecurring(s, "2026-10-26", "2026-11-20"));
    expect(upcoming.map((u) => `${u.name}@${u.date}`)).toEqual(["Rent@2026-11-01", "Spotify@2026-11-15"]);
    const a = await run((s) => affordability(s, 10000, "2026-10-26", "2026-11-02"));
    expect(a.liquidCashCents).toBe(650000);
    expect(a.upcomingBillsCents).toBe(90000);
    expect(a.projectedCashAfterPurchaseCents).toBe(650000 - 90000 - 10000 - a.projectedDiscretionaryCents);
  });
});
