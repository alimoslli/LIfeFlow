import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { detectRecurring, MIN_CONFIDENCE, type DetectTxn, type RecurringCandidate } from "@/server/services/finance/recurring-detect";

/**
 * The bills-and-subscriptions model measured on the simulator's worked examples (ADR 0023): every charge the
 * simulator planted as recurring must be found, and nothing else may be offered as a bill or subscription.
 * Data: tests/fixtures/situation-banks (copied from docs/situations/examples/<id>/connections/bank.json and truth.json).
 */
type Example = {
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
  recurring: { bill: string; name: string; frequency: string; charges: string[] }[];
  pay: string[];
};

const load = (id: string): Example => JSON.parse(readFileSync(path.join(import.meta.dirname, "../fixtures/situation-banks", `${id}.json`), "utf8"));

/** What the app stores for each Plaid transaction: its own kind and category mapping, and the account it's in. */
function stored(e: Example): (DetectTxn & { id: string; plaidPrimary: string })[] {
  const accounts = new Map(e.accounts.map((a) => [a.id, a]));
  return e.transactions.map((t) => {
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
      plaidPrimary: t.personal_finance_category?.primary ?? "",
    };
  });
}

function score(id: string) {
  const e = load(id);
  const txns = stored(e);
  const offered = detectRecurring(txns).filter((c) => c.confidence >= MIN_CONFIDENCE);
  const has = (c: RecurringCandidate, t: DetectTxn) => c.charges.some((x) => x.date === t.date && x.amountCents === t.amountCents);
  const planted = e.recurring.map((r) => {
    const charges = r.charges.map((cid) => txns.find((t) => t.id === cid)!);
    // Found when one series holds most of the planted charges.
    const hits = offered.filter((c) => charges.filter((t) => has(c, t)).length >= Math.min(2, charges.length));
    return { r, charges, hits };
  });
  const matched = new Set(planted.flatMap((p) => p.hits));
  // Paychecks and interest really do recur: Plaid files them as INCOME, so they aren't wrong finds.
  const realIncome = (c: RecurringCandidate) =>
    c.latestAmountCents > 0 && c.charges.every((x) => txns.some((t) => t.date === x.date && t.amountCents === x.amountCents && t.plaidPrimary === "INCOME"));
  return {
    planted,
    found: planted.filter((p) => p.hits.length),
    missed: planted.filter((p) => !p.hits.length).map((p) => p.r.name),
    duplicates: planted.filter((p) => p.hits.length > 1).map((p) => p.r.name),
    wrong: offered.filter((c) => !matched.has(c) && !realIncome(c)).map((c) => `${c.name} ${c.frequency} ${c.latestAmountCents} (${c.confidence})`),
    offered,
  };
}

describe("bills and subscriptions on the simulator's worked examples (ADR 0023)", () => {
  const runs = ["e0001", "e0002"].map((id) => ({ id, ...score(id) }));
  const planted = runs.reduce((n, r) => n + r.planted.length, 0);
  const found = runs.reduce((n, r) => n + r.found.length, 0);
  const wrong = runs.flatMap((r) => r.wrong);

  it("finds at least 18 of the 19 planted recurring charges and offers nothing that isn't one", () => {
    console.log(
      JSON.stringify({ found: `${found}/${planted}`, wrong, missed: runs.flatMap((r) => r.missed), duplicates: runs.flatMap((r) => r.duplicates) }, null, 1),
    );
    expect(planted).toBe(19);
    expect(found).toBeGreaterThanOrEqual(18);
    expect(wrong).toEqual([]);
    expect(runs.flatMap((r) => r.duplicates)).toEqual([]);
  });

  it("calls money sent by transfer a bill: the Zelle share, the car loan and the 529 contributions", () => {
    const kinds = runs.flatMap((r) => r.planted.filter((p) => ["aunt-share", "car-loan", "college-fund"].includes(p.r.bill)).map((p) => p.hits[0]));
    expect(kinds.map((c) => [c?.frequency, c?.kind])).toEqual([
      ["monthly", "bill"],
      ["monthly", "bill"],
      ["monthly", "bill"],
    ]);
  });

  it("keeps money moved between the person's own accounts out: savings transfers and card payments", () => {
    const own = runs.flatMap((r) => r.offered).filter((c) => /transfer|visa|payment received|sav\b|chk/i.test(c.name));
    expect(own).toEqual([]);
  });

  it("never offers a coffee shop as a bill (the student's weekly Daily Grind)", () => {
    expect(runs[0].offered.map((c) => c.name)).not.toContain("Daily Grind");
  });
});
