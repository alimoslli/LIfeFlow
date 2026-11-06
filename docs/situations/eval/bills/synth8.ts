import { detectRecurring, nthOccurrence, merchantKeys, storedKeyForms, merchantKey, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { cleanVendorName } from "@/lib/vendor";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const tidy = (d: string, m: string | null) => { const c = cleanVendorName(m || d); return c && c !== d.trim() ? c : m; };
const tx = (date: string, d: string, m: string | null, cents: number, cat: string | null, kind = "expense"): DetectTxn => ({ date, description: d, merchantName: tidy(d, m), amountCents: cents, kind, categoryName: cat, ...chk });
const show = (label: string, txns: DetectTxn[]) => {
  const r = detectRecurring(txns, { today: "2026-11-05" }).filter((c) => c.latestAmountCents < 0);
  console.log(`-- ${label}: ` + (r.length ? r.map((c) => `${c.seriesKey} "${c.name}" ${c.kind} ${c.frequency} ${c.latestAmountCents} n${c.occurrences} conf${c.confidence}`).join(" | ") : "nothing"));
};
const gas = Array.from({ length: 12 }, (_, i) => tx(nthOccurrence("2025-11-12", "monthly", i), "SOUTHWEST GAS CORP PAYMENT", "Southwest Gas", -[8800, 9900, 11200, 10400, 8100, 6200, 4300, 3900, 4100, 4500, 5200, 7400][i], "Utilities"));
const flights = [tx("2026-03-02", "SOUTHWEST AIRLINES 5262123", "Southwest Airlines", -24800, "Travel"), tx("2026-06-18", "SOUTHWEST AIRLINES 5262999", "Southwest Airlines", -31260, "Travel"), tx("2026-09-09", "SOUTHWEST AIRLINES 5262777", "Southwest Airlines", -18990, "Travel")];
show("Southwest Gas + 3 flights", [...gas, ...flights]);
const z = (date: string, who: string, cents: number, fmt = "Zelle money sent to") => tx(date, `${fmt} ${who}`, null, cents, null, "transfer");
const cap = [
  ...Array.from({ length: 6 }, (_, i) => z(nthOccurrence("2026-05-01", "monthly", i), "Jordan Miller", -70000)),
  ...Array.from({ length: 6 }, (_, i) => z(nthOccurrence("2026-05-15", "monthly", i), "Priya Shah", -[4500, 5200, 6100, 5800, 4900, 5300][i])),
  z("2026-06-07", "Sam Lee", -2500), z("2026-07-22", "Ana Ruiz", -4000), z("2026-08-29", "Sam Lee", -1800), z("2026-10-03", "Omar Ali", -6000),
];
show("Capital One Zelle", cap);
show("Wells format", cap.map((t) => ({ ...t, description: t.description.replace("Zelle money sent to ", "ZELLE TO ").toUpperCase() + " ON 10/01 REF #PP0AB12" })));
// Verizon Fios + Wireless, both ~$80
const fios = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-05", "monthly", i), "VERIZON*FIOS PAYMENT", "Verizon Fios", -7999, "Internet"));
const wl = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-20", "monthly", i), "VERIZON WIRELESS PAYMENTS", "Verizon Wireless", -8000, "Phone"));
show("Verizon Fios + Wireless", [...fios, ...wl]);
const xm = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-08", "monthly", i), "XFINITY MOBILE", "Xfinity Mobile", -4500, "Phone"));
const xi = Array.from({ length: 10 }, (_, i) => tx(nthOccurrence("2026-01-12", "monthly", i), "COMCAST CABLE COMM", "Comcast", -7500, "Internet"));
show("Xfinity Mobile + Comcast internet", [...xm, ...xi]);
// Read-time rule matching: stored rule keys vs tidied rows
const rows: [string, string, string | null][] = [["fios", "VERIZON*FIOS PAYMENT", "Verizon Fios"], ["wireless", "VERIZON WIRELESS PAYMENTS", "Verizon Wireless"], ["xmobile", "XFINITY MOBILE", "Xfinity Mobile"], ["xinternet", "COMCAST CABLE COMM", "Comcast"], ["swgas", "SOUTHWEST GAS CORP PAYMENT", "Southwest Gas"], ["swair", "SOUTHWEST AIRLINES 5262", "Southwest Airlines"]];
const storedRules = ["verizon wireless", "verizon fios", "verizon", "comcast", "xfinity", "xfinity mobile", "comcast cable comm", "southwest gas", "southwest airlines", "hbo max", "google one", "youtube tv", "youtube premium"];
for (const r of storedRules) {
  const forms = storedKeyForms(r);
  const hits = rows.filter(([, d, m]) => merchantKeys({ description: d, merchantName: tidy(d, m) }).some((k) => forms.includes(k))).map(([id]) => id);
  console.log(`rule "${r}" forms=[${forms.join(", ")}] applies to tidied:`, hits.join(",") || "-");
}
for (const [id, d, m] of rows) console.log(id, "tidied name:", tidy(d, m), "keys:", merchantKeys({ description: d, merchantName: tidy(d, m) }).join(" / "));
