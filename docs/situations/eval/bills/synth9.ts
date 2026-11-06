import { detectRecurring, nthOccurrence, merchantKey, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { cleanVendorName } from "@/lib/vendor";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
// Rows as origin/main's tidy already stored them (old BRANDS): merchantName overwritten
const rows: [string, string][] = [["SOUTHWEST GAS CORP PAYMENT", "Southwest Airlines"], ["VERIZON*FIOS PAYMENT", "Verizon"], ["XFINITY MOBILE", "Xfinity"], ["GOOGLE *YouTube TV", "YouTube"], ["YouTube TV", "YouTube TV"], ["GOOGLE *YouTube Premium", "YouTube"], ["COSTCO GAS #0412", "Costco"]];
for (const [d, m] of rows) console.log(JSON.stringify(d), "stored as", JSON.stringify(m), "-> key", merchantKey({ description: d, merchantName: m }), "| re-tidy gives", JSON.stringify(cleanVendorName(m || d)));
const tx = (date: string, d: string, m: string, cents: number, cat: string): DetectTxn => ({ date, description: d, merchantName: m, amountCents: cents, kind: "expense", categoryName: cat, ...chk });
const gas = Array.from({ length: 12 }, (_, i) => tx(nthOccurrence("2025-11-12", "monthly", i), "SOUTHWEST GAS CORP PAYMENT", "Southwest Airlines", -[8800, 9900, 11200, 10400, 8100, 6200, 4300, 3900, 4100, 4500, 5200, 7400][i], "Utilities"));
const flights = [tx("2026-03-02", "SOUTHWEST AIRLINES 5262123", "Southwest Airlines", -24800, "Travel"), tx("2026-06-18", "SOUTHWEST AIRLINES 5262999", "Southwest Airlines", -31260, "Travel"), tx("2026-09-09", "SOUTHWEST AIRLINES 5262777", "Southwest Airlines", -18990, "Travel")];
const r = detectRecurring([...gas, ...flights], { today: "2026-11-05" });
console.log("gas already tidied on main + flights:", r.map((c) => `${c.seriesKey} ${c.confidence}`).join(" | ") || "nothing (conf<0.5)", "| offered:", r.filter((c) => c.confidence >= 0.6).length);
const yt = [...Array.from({ length: 6 }, (_, i) => tx(nthOccurrence("2026-05-03", "monthly", i), "YouTube TV", "YouTube TV", -8299, "Streaming")), ...Array.from({ length: 6 }, (_, i) => tx(nthOccurrence("2026-05-03", "monthly", i), "GOOGLE *YouTube Premium", "YouTube", -1399, "Streaming"))];
console.log("YouTube TV + Premium (fresh names):", detectRecurring(yt, { today: "2026-11-05" }).map((c) => `${c.seriesKey} ${c.latestAmountCents}`).join(" | "));
