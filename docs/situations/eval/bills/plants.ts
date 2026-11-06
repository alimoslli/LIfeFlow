import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { detectRecurring } from "@/server/services/finance/recurring-detect";
import { scanTransactions } from "@/server/services/finance/findings";
import { addDaysStr } from "@/lib/dates";
let pn = 0, pok = 0, dn = 0, dok = 0;
for (const dir of process.argv.slice(2))
  for (const f of readdirSync(dir).sort()) {
    const e = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const accounts = new Map(e.accounts.map((a: any) => [a.id, a]));
    const txns = e.transactions.map((t: any) => { const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`); const a: any = accounts.get(t.account_id);
      return { id: t.id, date: t.date, amountCents: t.amount_cents, merchantName: t.merchant_name, description: t.description, kind: pfc.kind, categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)), pending: t.pending, accountId: t.account_id, accountType: a.type, accountMask: a.mask }; });
    for (const c of e.changes ?? []) {
      if (c.type === "price_change") {
        const first = txns.find((t: any) => t.id === c.id);
        if (!first || first.pending) continue;
        const asOf = txns.filter((t: any) => t.date <= first.date);
        const rec = e.recurring.find((r: any) => r.bill === c.bill); const old = rec.charges.map((id: string) => txns.find((t: any) => t.id === id)).filter((t: any) => t && t.date < first.date && t.amountCents !== first.amountCents).length;
        if (old < 2) continue; // need the old price twice in the window
        pn++;
        const s = detectRecurring(asOf).find((x) => x.charges.some((y) => y.date === first.date && y.amountCents === first.amountCents));
        const good = !!s && s.confidence >= 0.6 && s.priceChange?.date === first.date;
        if (good) pok++; else console.log("PRICE MISS", f, c.bill, first.date, first.amountCents, s ? `${s.seriesKey} conf${s.confidence} pc=${JSON.stringify(s.priceChange)}` : "no series");
      }
      if (c.type === "purchase" && c.id.startsWith("x-dup")) {
        const dup = txns.find((t: any) => t.id === c.id);
        if (!dup || dup.pending) continue;
        dn++;
        const today = addDaysStr(dup.date, 2);
        const r = scanTransactions(txns.filter((t: any) => t.date <= today), today);
        const hit = r.doubleCharges.some((d) => d.amountCents === -dup.amountCents);
        if (hit) dok++; else console.log("DUP MISS", f, c.id, dup.date, dup.amountCents, JSON.stringify(r.doubleCharges));
      }
    }
  }
console.log({ priceChanges: `${pok}/${pn}`, doubles: `${dok}/${dn}` });
