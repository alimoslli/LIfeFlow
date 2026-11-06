import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { detectRecurring } from "@/server/services/finance/recurring-detect";
import { addDaysStr } from "@/lib/dates";
let people = 0, real = 0, falsePush = 0, keysSeen = 0, newSubKeys = 0;
for (const dir of process.argv.slice(2))
  for (const f of readdirSync(dir).sort()) {
    const e = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const accounts = new Map(e.accounts.map((a: any) => [a.id, a]));
    const txns = e.transactions.map((t: any) => { const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`); const a: any = accounts.get(t.account_id);
      return { id: t.id, date: t.date, amountCents: t.amount_cents, merchantName: t.merchant_name, description: t.description, kind: pfc.kind, categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)), pending: t.pending, accountId: t.account_id, accountType: a.type, accountMask: a.mask }; });
    const planted = new Set((e.changes ?? []).filter((c: any) => c.type === "price_change").map((c: any) => { const t = txns.find((x: any) => x.id === c.id); return t ? `${t.date}|${t.amountCents}` : ""; }));
    const today = e.now.slice(0, 10);
    const pushed = new Set<string>(); const subFound = new Set<string>();
    people++;
    for (let back = 60; back >= 0; back--) {
      const D = addDaysStr(today, -back);
      const asOf = txns.filter((t: any) => t.date <= D);
      for (const c of detectRecurring(asOf, { today: D })) {
        if (c.confidence < 0.6 || c.latestAmountCents >= 0) continue;
        if (c.kind === "subscription") subFound.add(c.seriesKey);
        const p = c.priceChange;
        if (c.kind !== "subscription" || !p || !(-p.toCents > -p.fromCents + 50) || p.date < addDaysStr(D, -40)) continue;
        const k = `${c.merchantKey}:${-p.toCents}:${p.date}`;
        if (pushed.has(k)) continue;
        pushed.add(k);
        if (planted.has(`${p.date}|${p.toCents}`)) real++;
        else { falsePush++; console.log("FALSE PRICE PUSH", f, D, c.seriesKey, c.name, JSON.stringify(p)); }
      }
    }
    // multi-series merchants whose seriesKey varied over the 60 days
    const byMerchant = new Map<string, Set<string>>();
    for (const k of subFound) { const m = k.split("~")[0]; byMerchant.set(m, (byMerchant.get(m) ?? new Set()).add(k)); }
    for (const [m, ks] of byMerchant) if ([...ks].some((k) => k.includes("~"))) { newSubKeys += ks.size; console.log("KEYS", f, m, [...ks].join(",")); }
  }
console.log({ people, realPricePushes: real, falsePricePushes: falsePush, multiSeriesKeys: newSubKeys });
