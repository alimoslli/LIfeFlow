import { detectRecurring, nthOccurrence, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { scanTransactions } from "@/server/services/finance/findings";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const tx = (date: string, desc: string, cents: number, extra: Partial<DetectTxn> = {}): DetectTxn => ({ date, description: desc, merchantName: null, amountCents: cents, kind: cents < 0 ? "expense" : "refund", categoryName: null, ...chk, ...extra });
const mon = (start: string, n: number, desc: string, cents: (i: number) => number, extra: Partial<DetectTxn> = {}) => Array.from({ length: n }, (_, i) => tx(nthOccurrence(start, "monthly", i), desc, cents(i), extra));
const A = { merchantName: "Apple", categoryName: "Software" };
const show = (label: string, txns: DetectTxn[], today?: string) => {
  const r = detectRecurring(txns, today ? { today } : {}).filter((c) => c.latestAmountCents < 0);
  console.log(`-- ${label}: ` + (r.length ? r.map((c) => `${c.seriesKey} ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence}${c.priceChange ? " price " + JSON.stringify(c.priceChange) : ""}${c.duplicates.length ? " DUPS " + c.duplicates.map((d) => d.dates.join("/")).join(",") : ""}`).join(" | ") : "nothing"));
};
// iCloud 2.99 on the 11th since Jan; an app at 3.99 on Nov 9, two days before iCloud's Nov charge (today Nov 9)
const ic = mon("2026-01-11", 10, "APPLE.COM/BILL", () => -299, A);
show("iCloud + $3.99 app 2 days before next charge (as of Nov 9)", [...ic, tx("2026-11-09", "APPLE.COM/BILL", -399, A)], "2026-11-09");
show("same, after Nov 11 iCloud posts", [...ic, tx("2026-11-09", "APPLE.COM/BILL", -399, A), tx("2026-11-11", "APPLE.COM/BILL", -299, A)], "2026-11-11");
// Amazon Prime 14.99 on the 3rd plus an order of 19.99 on Nov 1
show("Prime 14.99 + $19.99 order Nov 1 (as of Nov 1)", [...mon("2026-01-03", 10, "AMAZON PRIME*AB12", () => -1499, { merchantName: "Amazon" }), tx("2026-11-01", "AMZN Mktp US*ZX9", -1999, { merchantName: "Amazon" })], "2026-11-01");
