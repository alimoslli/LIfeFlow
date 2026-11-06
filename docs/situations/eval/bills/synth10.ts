import { detectRecurring, nthOccurrence, merchantKey, merchantKeys, merchantDisplayName, storedKeyForms, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { correctedVendorName } from "@/lib/vendor";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const tx = (date: string, d: string, m: string | null, cents: number, cat: string): DetectTxn => ({ date, description: d, merchantName: m, amountCents: cents, kind: "expense", categoryName: cat, ...chk });
const show = (l: string, t: DetectTxn[]) => console.log(`-- ${l}:`, detectRecurring(t, { today: "2026-11-05" }).filter((c) => c.confidence >= 0.6).map((c) => `${c.seriesKey} "${c.name}" ${c.latestAmountCents} n${c.occurrences} ${c.confidence}`).join(" | ") || "nothing");
const gas = Array.from({ length: 12 }, (_, i) => tx(nthOccurrence("2025-11-12", "monthly", i), "SOUTHWEST GAS CORP PAYMENT", "Southwest Airlines", -[8800, 9900, 11200, 10400, 8100, 6200, 4300, 3900, 4100, 4500, 5200, 7400][i], "Utilities"));
const flights = [tx("2026-03-02", "SOUTHWEST AIRLINES 5262123", "Southwest Airlines", -24800, "Travel"), tx("2026-06-18", "SOUTHWEST AIRLINES 5262999", "Southwest Airlines", -31260, "Travel"), tx("2026-09-09", "SOUTHWEST AIRLINES 5262777", "Southwest Airlines", -18990, "Travel")];
show("SW Gas stored as Airlines + flights", [...gas, ...flights]);
const fios = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-05", "monthly", i), "VERIZON*FIOS PAYMENT", "Verizon", -7999, "Internet"));
const wl = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-20", "monthly", i), "VERIZON WIRELESS PAYMENTS", "Verizon", -8000, "Phone"));
show("Fios + Wireless both stored as Verizon", [...fios, ...wl]);
const rows: [string, string, string | null][] = [["fiosOld", "VERIZON*FIOS PAYMENT", "Verizon"], ["wireless", "VERIZON WIRELESS PAYMENTS", "Verizon"], ["ytTV", "GOOGLE *YouTube TV", "YouTube"], ["ytTV2", "YouTube TV", "YouTube TV"], ["ytPrem", "GOOGLE *YouTube Premium", "YouTube"], ["swgasOld", "SOUTHWEST GAS CORP PAYMENT", "Southwest Airlines"], ["swair", "SOUTHWEST AIRLINES 5262", "Southwest Airlines"]];
for (const r of ["verizon", "verizon fios", "youtube", "youtube tv", "youtube premium", "southwest airlines", "southwest gas"]) {
  const forms = storedKeyForms(r);
  console.log(`rule "${r}" [${forms}] applies to:`, rows.filter(([, d, m]) => merchantKeys({ description: d, merchantName: m }).some((k) => forms.includes(k))).map(([id]) => id).join(",") || "-");
}
for (const [id, d, m] of rows) console.log(id, "key", merchantKey({ description: d, merchantName: m }), "| keys", merchantKeys({ description: d, merchantName: m }).join(" / "), "| shown", merchantDisplayName({ description: d, merchantName: m }));
// typed names must not be renamed
for (const [stored, line] of [["Home internet", "VERIZON*FIOS PAYMENT"], ["Verizon FiOS (home)", "VERIZON*FIOS PAYMENT"], ["Gas bill", "SOUTHWEST GAS CORP PAYMENT"], ["Southwest", "SOUTHWEST GAS CORP PAYMENT"], ["verizon", "VERIZON*FIOS PAYMENT"], ["Shell's Seafood", "SHELL'S SEAFOOD 22"], ["Shell", "SHELL'S SEAFOOD 22"], ["Netflix", "NETFLIX.COM 866-579-7172 CA"]] as const)
  console.log(`typed/stored "${stored}" on ${JSON.stringify(line)} ->`, correctedVendorName(stored, line));
for (const [d, m] of [["NETFLIX.COM 866-579-7172 CA", null], ["NETFLIX.COM 866-579-7172 CA", "Netflix"], ["NETFLIX CA", null], ["Spotify USA", null], ["HULU 877-555-0142 CA", null], ["TARGET T-1234 MINNEAPOLIS MN", null], ["CITY POWER AND LIGHT TX", null]] as const)
  console.log(JSON.stringify(d), m, "->", merchantKey({ description: d, merchantName: m }));
