import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { scanTransactions } from "@/server/services/finance/findings";
import { detectRecurring, MIN_CONFIDENCE, type DetectTxn, type RecurringCandidate } from "@/server/services/finance/recurring-detect";

/**
 * A few of the simulated people the bills reviewer measured the finder on (ADR 0023 targets: 97% found,
 * at most 1 wrong in 50). Each carries a case that once failed: a Venmo utilities share among friends'
 * payments, a pending third charge, a price change on a bill, overdraft fees, iCloud among App Store
 * purchases. Data: tests/fixtures/simulated-people (made-up lives from docs/situations/simulator).
 */
type Person = {
  now: string;
  accounts: { id: string; type: string; mask: string | null }[];
  transactions: {
    id: string;
    account_id: string;
    date: string;
    description: string;
    merchant_name: string | null;
    amount_cents: number;
    pending: boolean;
    personal_finance_category: { primary: string; detailed: string } | null;
  }[];
  recurring: { bill: string; frequency: string; charges: string[]; price_changes: string[] }[];
};
const dir = path.join(import.meta.dirname, "../fixtures/simulated-people");
const people = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ file: f, ...(JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Person) }));

/** What the app stores for each Plaid transaction: its own kind and category mapping, and the account it's in. */
function stored(p: Person): (DetectTxn & { id: string; income: boolean })[] {
  const accounts = new Map(p.accounts.map((a) => [a.id, a]));
  return p.transactions.map((t) => {
    const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`);
    return {
      id: t.id,
      date: t.date,
      amountCents: t.amount_cents,
      merchantName: t.merchant_name,
      description: t.description,
      kind: pfc.kind,
      categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)),
      pending: t.pending,
      accountId: t.account_id,
      accountType: accounts.get(t.account_id)!.type,
      accountMask: accounts.get(t.account_id)!.mask,
      income: t.personal_finance_category?.primary === "INCOME",
    };
  });
}

describe("bills and subscriptions on simulated people the reviewer measured (ADR 0023)", () => {
  for (const p of people)
    it(`${p.file}: finds every planted recurring charge and offers nothing else`, () => {
      const txns = stored(p);
      const offered = detectRecurring(txns).filter((c) => c.confidence >= MIN_CONFIDENCE);
      const has = (c: RecurringCandidate, id: string) => {
        const t = txns.find((x) => x.id === id)!;
        return c.charges.some((x) => x.date === t.date && x.amountCents === t.amountCents);
      };
      // One-off purchases planted on dates (textbooks) and bills with one charge so far aren't recurring yet.
      const planted = p.recurring.filter((r) => r.frequency !== "dates" && r.charges.length >= 2);
      const hit = (r: Person["recurring"][number]) => offered.filter((c) => r.charges.filter((id) => has(c, id)).length >= 2);
      expect(planted.filter((r) => hit(r).length !== 1).map((r) => r.bill)).toEqual([]);
      // Paychecks and interest really recur (Plaid files them as INCOME); anything else offered must be planted.
      const matched = new Set(planted.flatMap(hit));
      const income = (c: RecurringCandidate) =>
        c.latestAmountCents > 0 && c.charges.every((x) => txns.some((t) => t.income && t.date === x.date && t.amountCents === x.amountCents));
      expect(offered.filter((c) => !matched.has(c) && !income(c)).map((c) => `${c.name} ${c.frequency} ${c.latestAmountCents}`)).toEqual([]);
      // A planted price change is reported on its first changed charge.
      for (const r of planted.filter((x) => x.price_changes.length)) {
        const first = txns.find((t) => t.id === r.price_changes[0])!;
        expect(hit(r)[0].priceChange).toMatchObject({ toCents: first.amountCents, date: first.date });
      }
      // And nobody is told about a double charge that didn't happen.
      expect(scanTransactions(txns, p.now).doubleCharges).toEqual([]);
    });
});
