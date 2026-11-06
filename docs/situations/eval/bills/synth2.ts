import { detectRecurring, nthOccurrence, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { scanTransactions } from "@/server/services/finance/findings";
import { addDaysStr } from "@/lib/dates";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const tx = (date: string, desc: string, cents: number, extra: Partial<DetectTxn> = {}): DetectTxn => ({ date, description: desc, merchantName: null, amountCents: cents, kind: cents < 0 ? "expense" : "refund", categoryName: null, ...chk, ...extra });
const mon = (start: string, n: number, desc: string, cents: (i: number) => number, extra: Partial<DetectTxn> = {}) => Array.from({ length: n }, (_, i) => tx(nthOccurrence(start, "monthly", i), desc, cents(i), extra));
function show(label: string, txns: DetectTxn[], today = "2026-11-05") {
  const r = detectRecurring(txns).filter((c) => c.latestAmountCents < 0);
  console.log(`-- ${label}: ` + (r.length ? r.map((c) => `${c.seriesKey} ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence}${c.priceChange ? " price " + JSON.stringify(c.priceChange) : ""}${c.duplicates.length ? " DUPS " + c.duplicates.map((d) => d.dates.join("/")).join(",") : ""}`).join(" | ") : "nothing"));
  const s = scanTransactions(txns as any, today);
  if (s.doubleCharges.length) console.log("   doubleCharges:", JSON.stringify(s.doubleCharges));
}
const NF = "NETFLIX.COM";
show("Netflix 2 old + 1 new", mon("2026-08-15", 3, NF, (i) => (i < 2 ? -1549 : -1799)));
show("Netflix 10 old + 1 new", mon("2026-01-15", 11, NF, (i) => (i < 10 ? -1549 : -1799)));
show("Netflix 4 runs", mon("2025-11-15", 12, NF, (i) => [-1299, -1299, -1399, -1399, -1399, -1549, -1549, -1549, -1699, -1699, -1799, -1799][i]));
show("Spotify 6 mo + double Oct 15", [...mon("2026-05-15", 6, "Spotify USA", () => -1199), tx("2026-10-15", "Spotify USA", -1199)]);
show("Spotify double then refunded", [...mon("2026-05-15", 6, "Spotify USA", () => -1199), tx("2026-10-15", "Spotify USA", -1199), tx("2026-10-17", "Spotify USA", 1199, { kind: "refund" })]);
show("Spotify failed, refunded, recharged next day", [...mon("2026-05-15", 5, "Spotify USA", () => -1199), tx("2026-10-15", "Spotify USA", -1199), tx("2026-10-15", "Spotify USA", 1199, { kind: "refund" }), tx("2026-10-16", "Spotify USA", -1199)]);
// Family phone: second line added in Sept, billed the same day the same amount
show("Phone 2nd line added Sept", [...mon("2025-11-13", 12, "VERIZON WIRELESS PAYMENTS", () => -4500, { categoryName: "Phone" }), ...mon("2026-09-13", 3, "VERIZON WIRELESS PAYMENTS", () => -4500, { categoryName: "Phone" })]);
// Two plans from same merchant, a day apart, second started 2 months ago
show("Two Netflix plans, 2nd started Sept a day later", [...mon("2025-11-15", 12, NF, () => -1549), ...mon("2026-09-16", 2, NF, () => -1549)]);
// Two iCloud plans for family, a day apart, both a year
show("Two iCloud plans 1 day apart, a year", [...mon("2025-11-14", 12, "APPLE.COM/BILL", () => -299, { merchantName: "Apple" }), ...mon("2025-11-15", 12, "APPLE.COM/BILL", () => -299, { merchantName: "Apple" })]);
// iCloud + Apple Music + one-off $2.99 app
show("iCloud + Music + 2.99 app", [...mon("2026-05-03", 6, "APPLE.COM/BILL", () => -299, { merchantName: "Apple" }), ...mon("2026-05-20", 6, "APPLE.COM/BILL", () => -1099, { merchantName: "Apple" }), tx("2026-09-27", "APPLE.COM/BILL", -299, { merchantName: "Apple" })]);
show("iCloud + Music, no app", [...mon("2026-05-03", 6, "APPLE.COM/BILL", () => -299, { merchantName: "Apple" }), ...mon("2026-05-20", 6, "APPLE.COM/BILL", () => -1099, { merchantName: "Apple" })]);
// Apple Music price rise from 10.99 to 11.99 with iCloud alongside
show("iCloud + Music price rise", [...mon("2026-05-03", 6, "APPLE.COM/BILL", () => -299, { merchantName: "Apple" }), ...mon("2026-05-20", 6, "APPLE.COM/BILL", (i) => (i < 5 ? -1099 : -1199), { merchantName: "Apple" })]);
// Subscription plus tax change by cents, then back
show("Hulu tax wobble", mon("2026-03-06", 8, "HULU 877", (i) => [-1899, -1899, -1899, -1938, -1938, -1899, -1938, -1938][i]));
// Electric variable
show("Electric variable", mon("2025-11-10", 12, "CITY POWER AND LIGHT", (i) => -[10479, 9800, 12010, 13020, 11000, 9050, 8000, 9900, 12500, 13900, 11200, 9700][i], { categoryName: "Utilities" }));
// Phone fixed with exact repeats of a different amount (overage months) 
show("Phone 65 with two 72.50 months", mon("2025-11-23", 12, "TMOBILE*AUTO PAY", (i) => (i === 4 || i === 9 ? -7250 : -6500), { categoryName: "Phone" }));
// Insurance 6-monthly? quarterly
show("Gym monthly with a 2-day-early pending/posted pair", [...mon("2026-05-01", 6, "PLANET FITNESS", () => -2499), tx("2026-10-30", "PLANET FITNESS", -2499, { pending: true })]);
// 31st anchor
console.log("31st:", [0, 1, 2, 3, 4].map((n) => nthOccurrence("2026-01-31", "monthly", n, 31)).join(" "));
show("Rent on last day", mon("2026-01-31", 10, "RENT CAMPUS EDGE APTS", () => -120000, { categoryName: "Rent" }));
