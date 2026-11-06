import { detectRecurring, nthOccurrence, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { addDaysStr } from "@/lib/dates";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const t = (date: string, description: string, amountCents: number, kind = "transfer", extra: Partial<DetectTxn> = {}): DetectTxn => ({ date, description, merchantName: null, amountCents, kind, categoryName: null, ...chk, ...extra });
const show = (label: string, txns: DetectTxn[], opts = {}) => {
  const r = detectRecurring(txns, opts).filter((c) => c.latestAmountCents < 0);
  console.log(`-- ${label}: ` + (r.length ? r.map((c) => `${c.seriesKey} ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence}${c.priceChange ? " pc " + JSON.stringify(c.priceChange) : ""}`).join(" | ") : "nothing"));
};
const bw = (start: string, n: number, f: (i: number, d: string) => DetectTxn) => Array.from({ length: n }, (_, i) => f(i, addDaysStr(start, 14 * i)));
show("biweekly Zelle rent to roommate", bw("2026-06-05", 11, (i, d) => t(d, `ZELLE TO JORDAN M CONF# ${i}AB`, -42500)));
show("biweekly Zelle to landlord", bw("2026-06-05", 11, (i, d) => t(d, `ZELLE TO SUNRISE PROPERTY MGMT CONF# ${i}AB`, -60000)));
show("biweekly Venmo rent share", bw("2026-06-05", 11, (i, d) => t(d, `VENMO PAYMENT 99${i}1234`, -40000)));
show("weekly Venmo childcare", Array.from({ length: 16 }, (_, i) => t(addDaysStr("2026-07-03", 7 * i), `VENMO PAYMENT 77${i}1234`, -15000)));
show("1st and 15th Zelle rent halves", [...Array.from({ length: 5 }, (_, i) => t(nthOccurrence("2026-06-01", "monthly", i), `ZELLE TO JORDAN M CONF# ${i}A`, -40000)), ...Array.from({ length: 5 }, (_, i) => t(nthOccurrence("2026-06-15", "monthly", i), `ZELLE TO JORDAN M CONF# ${i}B`, -40000))]);
// Price rise confirmation in production mode (no today passed): Netflix 15.49 x5 then 17.99 on Oct 15, other spending continues daily
const nf = Array.from({ length: 5 }, (_, i) => t(nthOccurrence("2026-05-15", "monthly", i), "NETFLIX.COM", -1549, "expense"));
const daily = (to: string) => { const o: DetectTxn[] = []; for (let d = "2026-05-01"; d <= to; d = addDaysStr(d, 1)) o.push(t(d, `CORNER STORE ${d}`, -(300 + (Number(d.slice(8)) * 37) % 900), "expense", { categoryName: "Household" })); return o; };
for (const asOf of ["2026-10-15", "2026-10-17", "2026-10-18", "2026-10-20"]) {
  const all = [...nf, t("2026-10-15", "NETFLIX.COM", -1799, "expense")];
  show(`Netflix rise, daily sync, as of ${asOf} (no today)`, [...all, ...daily(asOf)].filter((x) => x.date <= asOf));
  show(`Netflix rise, quiet account, as of ${asOf} (no today)`, all.filter((x) => x.date <= asOf));
  show(`Netflix rise, quiet account, as of ${asOf} (today passed)`, all.filter((x) => x.date <= asOf), { today: asOf });
}
