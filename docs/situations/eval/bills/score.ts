import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import * as NEW from "@/server/services/finance/recurring-detect";
import * as BASE from "./base-recurring-detect";

type Ex = any;
const which = process.argv[2] === "base" ? "base" : "new";
const det: any = which === "base" ? BASE : NEW;
const dirs = process.argv.slice(3);
const verbose = !!process.env.V;

function stored(e: Ex) {
  const accounts = new Map(e.accounts.map((a: any) => [a.id, a]));
  return e.transactions.map((t: any) => {
    const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`);
    const a: any = accounts.get(t.account_id);
    return {
      id: t.id, date: t.date, amountCents: t.amount_cents, merchantName: t.merchant_name, description: t.description, kind: pfc.kind,
      categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)),
      pending: t.pending, accountId: t.account_id, accountType: a.type, accountMask: a.mask, plaidPrimary: t.personal_finance_category?.primary ?? "",
    };
  });
}
let P = 0, F = 0, W = 0, O = 0, D = 0, ms = 0;
const allMissed: string[] = [], allWrong: string[] = [], allDup: string[] = [], kindIssues: string[] = [];
for (const dir of dirs)
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const e = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const txns = stored(e);
    const t0 = performance.now();
    const all = det.detectRecurring(txns);
    ms += performance.now() - t0;
    const offered = all.filter((c: any) => c.confidence >= 0.6);
    const today = e.now.slice(0, 10);
    const has = (c: any, t: any) => (c.charges ? c.charges.some((x: any) => x.date === t.date && x.amountCents === t.amountCents) : false);
    const neutralIds = new Set<string>();
    const planted = e.recurring
      .filter((r: any) => {
        if (r.frequency === "dates" || r.charges.length < 2) { r.charges.forEach((c: string) => neutralIds.add(c)); return false; }
        return true;
      })
      .map((r: any) => {
        const charges = r.charges.map((cid: string) => txns.find((t: any) => t.id === cid)).filter(Boolean);
        const hits = which === "base"
          ? offered.filter((c: any) => charges.some((t: any) => NEW.merchantKey(t) === c.merchantKey && Math.sign(t.amountCents) === Math.sign(c.latestAmountCents)))
          : offered.filter((c: any) => charges.filter((t: any) => has(c, t)).length >= Math.min(2, charges.length));
        return { r, charges, hits };
      });
    const matched = new Set(planted.flatMap((p: any) => p.hits));
    const realIncome = (c: any) => c.latestAmountCents > 0 && (c.charges ? c.charges.every((x: any) => txns.some((t: any) => t.date === x.date && t.amountCents === x.amountCents && t.plaidPrimary === "INCOME")) : txns.some((t: any) => NEW.merchantKey(t) === c.merchantKey && t.plaidPrimary === "INCOME"));
    const neutral = (c: any) => c.charges && c.charges.some((x: any) => txns.some((t: any) => neutralIds.has(t.id) && t.date === x.date && t.amountCents === x.amountCents));
    const wrong = offered.filter((c: any) => !matched.has(c) && !realIncome(c) && !neutral(c));
    P += planted.length;
    F += planted.filter((p: any) => p.hits.length).length;
    W += wrong.length;
    O += offered.filter((c: any) => !realIncome(c)).length;
    for (const p of planted) {
      if (!p.hits.length) allMissed.push(`${f} ${p.r.bill} (${p.charges.map((t: any) => `${t.date} ${t.amountCents} ${t.description} ${t.kind}`).join("; ")})`);
      if (p.hits.length > 1) { D++; allDup.push(`${f} ${p.r.bill}: ${p.hits.map((c: any) => `${c.seriesKey} ${c.latestAmountCents} n${c.occurrences}`).join(" | ")}`); }
    }
    for (const c of wrong) allWrong.push(`${f} ${c.seriesKey ?? c.merchantKey} ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence} [${(c.charges ?? []).map((x: any) => x.date).join(",")}]`);
  }
console.log(JSON.stringify({ which, planted: P, found: F, recall: (F / P).toFixed(3), offeredNonIncome: O, wrong: W, duplicates: D, msTotal: Math.round(ms) }));
console.log("MISSED\n" + allMissed.join("\n"));
console.log("WRONG\n" + allWrong.join("\n"));
console.log("DUP\n" + allDup.join("\n"));
