import { describe, expect, it } from "vitest";
import { spendableCents, summarizeBalances } from "@/server/services/finance/accounts";

const at = new Date("2026-11-05T12:00:00Z");
const acct = (o: Partial<Parameters<typeof summarizeBalances>[0][number]>) => ({
  type: "depository" as const,
  source: "plaid",
  currentBalanceCents: 100_000,
  availableBalanceCents: 100_000,
  includeInNetWorth: true,
  balanceUpdatedAt: at,
  ...o,
});

describe("Available now counts charges still pending at the bank", () => {
  it("uses the bank's available balance when pending charges make it lower", () => {
    expect(spendableCents(acct({ availableBalanceCents: 67_430 }))).toBe(67_430);
    expect(summarizeBalances([acct({ availableBalanceCents: 67_430 }), acct({ type: "cash", source: "manual", currentBalanceCents: 2_000 })]).cashCents).toBe(
      69_430,
    );
  });

  it("never counts an overdraft line as money", () => {
    expect(spendableCents(acct({ availableBalanceCents: 150_000 }))).toBe(100_000);
  });

  it("keeps the balance for manual accounts, missing available balances and cards", () => {
    expect(spendableCents(acct({ source: "manual", availableBalanceCents: 10 }))).toBe(100_000);
    expect(spendableCents(acct({ availableBalanceCents: null }))).toBe(100_000);
    expect(spendableCents(acct({ type: "credit", availableBalanceCents: 5_000 }))).toBe(100_000);
  });
});
