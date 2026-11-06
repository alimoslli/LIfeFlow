import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mapPfc, pickCategory } from "@/server/integrations/plaid";
import { keywordCategory } from "@/server/services/finance/categorize";
import { scanTransactions } from "@/server/services/finance/findings";
import { addDaysStr } from "@/lib/dates";
let people = 0, flagged = 0;
for (const dir of process.argv.slice(2))
  for (const f of readdirSync(dir).sort()) {
    const e = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const accounts = new Map(e.accounts.map((a: any) => [a.id, a]));
    const txns = e.transactions.map((t: any) => { const pfc = mapPfc(t.personal_finance_category, t.amount_cents, `${t.merchant_name ?? ""} ${t.description}`); const a: any = accounts.get(t.account_id);
      return { id: t.id, date: t.date, amountCents: t.amount_cents, merchantName: t.merchant_name, description: t.description, kind: pfc.kind, categoryName: pickCategory(pfc, keywordCategory({ merchantName: t.merchant_name, description: t.description }, t.amount_cents)), pending: t.pending, accountId: t.account_id, accountType: a.type, accountMask: a.mask }; });
    const today = e.now.slice(0, 10);
    // as the detector does: last 120 days; also check monthly snapshots over the last 4 months
    for (const back of [0, 30, 60, 90]) {
      const day = addDaysStr(today, -back);
      const win = txns.filter((t: any) => t.date >= addDaysStr(day, -120) && t.date <= day);
      const r = scanTransactions(win, day);
      people++;
      for (const d of r.doubleCharges) { flagged++; console.log(f, day, JSON.stringify(d)); }
    }
  }
console.log({ scans: people, flagged });
