import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { getBriefing } from "@/server/briefing";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { cashflowFor, moneyOverview } from "@/server/services/finance/overview";
import { setBudget } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { addManualHolding } from "@/server/services/finance/wealth";
import { resolvePeriod } from "@/lib/periods";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const TODAY = "2026-10-28";

describe("one source of truth for money", () => {
  it("Today, Money, Budgets and Transactions reconcile over the same named range", async () => {
    const { user, run } = await makeUser();
    await run(async (s) => {
      const checking = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 150_000 });
      await createManualAccount(s, { name: "High-yield savings", type: "depository", currentBalanceCents: 500_000 });
      const card = await createManualAccount(s, { name: "Visa", type: "credit", currentBalanceCents: 30_000 });
      const brokerage = await createManualAccount(s, { name: "Brokerage", type: "investment", currentBalanceCents: 1_000_000 });
      await addManualHolding(s, { accountId: brokerage.id, name: "Total market", symbol: "VTI", quantity: 10, valueCents: 900_000, costBasisCents: 800_000 });
      const food = (await getCategoryByName(s, "Food & Dining"))!;
      const groceries = (await getCategoryByName(s, "Groceries"))!;
      const rent = (await getCategoryByName(s, "Rent"))!;
      const ccPay = (await getCategoryByName(s, "Credit Card Payment"))!;
      const pay = (await getCategoryByName(s, "Paycheck"))!;
      await setBudget(s, { month: TODAY, categoryId: food.id, limitCents: 45_000 });
      const t = (accountId: string, date: string, amountCents: number, categoryId: string, description: string) =>
        createTransaction(s, { accountId, date, amountCents, categoryId, description });
      await t(checking.id, "2026-10-03", -85_200, groceries.id, "Market");
      await t(card.id, "2026-10-10", -120_000, rent.id, "Rent");
      await t(checking.id, "2026-10-15", 200_000, pay.id, "Payroll");
      await t(checking.id, "2026-10-25", -60_000, ccPay.id, "Card payment");
      await t(card.id, "2026-10-25", 60_000, ccPay.id, "Payment received");
      await t(checking.id, "2026-09-20", -5_000, groceries.id, "Last month");
    });
    const o = await run((s) => moneyOverview(s, TODAY));
    expect(o.month.period.label).toBe("Oct 1 to 28, 2026");
    expect(o.month.netSpendingCents).toBe(205_200); // groceries + rent; card payment is a transfer
    expect(o.month.incomeCents).toBe(200_000);
    expect(o.budgets.budgetedSpentCents + o.budgets.unbudgetedSpentCents).toBe(o.month.netSpendingCents);
    expect(o.budgets.budgetedSpentCents).toBe(85_200);
    expect(o.balances).toMatchObject({ cashCents: 150_000, savingsCents: 500_000, creditOwedCents: 30_000, investmentsCents: 1_000_000 });
    expect(o.investments).toMatchObject({ valueCents: 1_000_000, holdingsValueCents: 900_000, returnPct: 12.5 });

    // Transactions' default range is the same, so its total matches.
    const tx = await run((s) => cashflowFor(s, resolvePeriod(undefined, TODAY)));
    expect(tx.netSpendingCents).toBe(o.month.netSpendingCents);

    // Today's briefing reads the same numbers, including the portfolio.
    const session = { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" as const };
    const { snapshot } = await run((s) => getBriefing(s, session, new Date("2026-10-28T15:00:00Z")));
    expect(snapshot.money).toMatchObject({
      spentThisMonthCents: o.month.netSpendingCents,
      incomeThisMonthCents: o.month.incomeCents,
      liquidCents: o.balances.cashCents,
      periodLabel: o.month.period.label,
      investments: { valueCents: o.investments!.valueCents },
    });
  });
});
