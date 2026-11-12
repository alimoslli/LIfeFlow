/**
 * Builds the labelled purchases for Step 0 (docs/backlog/2026-11-12-local-models.md): made-up spending from the life
 * simulator (the personas' shops, then tests/fixtures/simulated-people and the situation cases' bank files), one per shop, each
 * labelled with the category the bank's own category gives it through our mapping (`mapPfc`). The sorter under test only
 * sees the statement line and the merchant name, as on a CSV or a manual add. Run once; the output is frozen:
 *   npx tsx scripts/local-models/build-purchases.ts
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mapPfc } from "../../src/server/integrations/plaid";
import { DEFAULT_CATEGORIES } from "../../src/server/services/finance/categories";
import { merchantKey } from "../../src/server/services/finance/recurring-detect";
import { purchaseBank } from "../../tests/fixtures/purchases-bank";

type Txn = { id: string; description: string; merchant_name: string | null; amount_cents: number; personal_finance_category: { primary: string; detailed: string } | null };

const files = [
  ...readdirSync("tests/fixtures/simulated-people").map((f) => path.join("tests/fixtures/simulated-people", f)),
  ...readdirSync("docs/situations/cases")
    .map((d) => path.join("docs/situations/cases", d, "connections/bank.json"))
    .filter(existsSync),
];
const parentOf = new Map<string, string>();
for (const c of DEFAULT_CATEGORIES) for (const ch of c.children ?? []) parentOf.set(ch, c.name);

const seen = new Set<string>();
const out: { id: string; description: string; merchant: string | null; amountCents: number; label: string; accept: string[] }[] = [];
const PRIMARIES = ["BANK_FEES", "ENTERTAINMENT", "FOOD_AND_DRINK", "GENERAL_MERCHANDISE", "HOME_IMPROVEMENT", "MEDICAL", "PERSONAL_CARE", "GENERAL_SERVICES", "GOVERNMENT_AND_NON_PROFIT", "TRANSPORTATION", "TRAVEL", "RENT_AND_UTILITIES", "LOAN_PAYMENTS", "TRANSFER_OUT", "TRANSFER_IN", "INCOME"];
function take(id: string, t: { description: string; merchant_name: string | null; amount_cents: number }, pfc: Txn["personal_finance_category"]) {
  if (t.amount_cents >= 0) return;
  const m = mapPfc(pfc, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`);
  if (m.kind !== "expense" || !m.category) return;
  // one per shop, by the same key the app uses to tell shops apart (store numbers and order codes don't make another)
  const key = merchantKey({ merchantName: t.merchant_name, description: t.description });
  if (!key || seen.has(key)) return;
  seen.add(key);
  const parent = parentOf.get(m.category);
  out.push({ id, description: t.description, merchant: t.merchant_name, amountCents: t.amount_cents, label: m.category, accept: parent ? [m.category, parent] : [m.category] });
}
// the personas' spending habits: every shop they name, with the bank category the habit gives its charges
for (const f of readdirSync("docs/situations/personas").filter((x) => x.endsWith(".json")).sort()) {
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const h = o as { id?: string; pfc?: string; merchants?: { description: string; merchant_name: string | null }[]; amount_cents?: number[] };
    if (h.pfc && Array.isArray(h.merchants)) {
      const primary = PRIMARIES.find((p) => h.pfc!.startsWith(p)) ?? "";
      for (const [i, mm] of h.merchants.entries())
        take(`${f.slice(0, 5)}-${h.id}-${i}`, { ...mm, amount_cents: -(h.amount_cents?.[0] ?? 1000) }, { primary, detailed: h.pfc });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(readFileSync(path.join("docs/situations/personas", f), "utf8")));
}
// and the simulated accounts' own charges (bills, one-offs)
for (const f of files.sort()) {
  const data = JSON.parse(readFileSync(f, "utf8")) as { transactions: Txn[] };
  for (const t of data.transactions) take(`${path.basename(f, ".json")}-${t.id}`, t, t.personal_finance_category);
}
// then the hand-labelled bank (tests/fixtures/purchases-bank.ts), every label one of our own category names
const names = new Set(DEFAULT_CATEGORIES.flatMap((c) => [c.name, ...(c.children ?? [])]));
for (const [i, b] of purchaseBank().entries()) {
  if (!names.has(b.label)) throw new Error(`not a category: ${b.label}`);
  const key = merchantKey({ merchantName: null, description: b.description });
  if (!key || seen.has(key)) continue;
  seen.add(key);
  const parent = parentOf.get(b.label);
  out.push({ id: `bank-${i}`, description: b.description, merchant: null, amountCents: -1500, label: b.label, accept: parent ? [b.label, parent] : [b.label] });
}
const set = out.slice(0, 300);
writeFileSync("tests/fixtures/purchases-labelled.json", `${JSON.stringify(set, null, 1)}\n`);
console.log(`${set.length} labelled purchases (of ${out.length} distinct) from ${files.length} files`);
