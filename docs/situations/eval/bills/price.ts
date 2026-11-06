import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { detectRecurring } from "@/server/services/finance/recurring-detect";
const dir = process.argv[2];
let n = 0, ok = 0;
for (const f of readdirSync(dir).sort()) {
  const e = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const accounts = new Map(e.accounts.map((a: any) => [a.id, a]));
  const txns = e.transactions.map((t: any) => { const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`); const a: any = accounts.get(t.account_id);
    return { id: t.id, date: t.date, amountCents: t.amount_cents, merchantName: t.merchant_name, description: t.description, kind: pfc.kind, categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)), pending: t.pending, accountId: t.account_id, accountType: a.type, accountMask: a.mask }; });
  const all = detectRecurring(txns);
  for (const r of e.recurring.filter((r: any) => r.price_changes.length)) {
    n++;
    const first = txns.find((t: any) => t.id === r.price_changes[0]);
    const s = all.find((c) => c.charges.some((x) => first && x.date === first.date && x.amountCents === first.amountCents));
    const good = s && s.confidence >= 0.6 && s.priceChange && s.priceChange.date === first.date;
    if (good) ok++;
    console.log(f, r.bill, first ? `${first.date} ${first.amountCents} ${first.categoryName}` : "no first charge yet", s ? `${s.seriesKey} ${s.kind} conf${s.confidence} pc=${JSON.stringify(s.priceChange)}` : "NOT FOUND", good ? "OK" : "MISS");
  }
}
console.log({ n, ok });
