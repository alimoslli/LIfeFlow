import { detectRecurring, nthOccurrence, merchantKeys, type DetectTxn } from "@/server/services/finance/recurring-detect";
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
show("Southwest Gas alone", gas);
show("Southwest Gas + 3 Southwest flights", [...gas, ...flights]);
// Capital One Zelle: rent to roommate $700 on the 1st + a variable utilities share to another roommate on the 15th + friends
const z = (date: string, who: string, cents: number) => tx(date, `Zelle money sent to ${who}`, null, cents, null, "transfer");
const cap = [
  ...Array.from({ length: 6 }, (_, i) => z(nthOccurrence("2026-05-01", "monthly", i), "Jordan Miller", -70000)),
  ...Array.from({ length: 6 }, (_, i) => z(nthOccurrence("2026-05-15", "monthly", i), "Priya Shah", -[4500, 5200, 6100, 5800, 4900, 5300][i])),
  z("2026-06-07", "Sam Lee", -2500), z("2026-07-22", "Ana Ruiz", -4000), z("2026-08-29", "Sam Lee", -1800), z("2026-10-03", "Omar Ali", -6000),
];
show("Capital One Zelle: rent + utilities share + friends", cap);
const capOther = cap.map((t) => ({ ...t, description: t.description.replace("Zelle money sent to", "Zelle Payment To") }));
show("Same, Chase format", capOther);
// Rules stored before the tidy, matched against tidied rows
for (const [stored, d, m] of [["verizon wireless", "VERIZON WIRELESS PAYMENTS", "Verizon Wireless"], ["comcast", "COMCAST CABLE COMM", "Comcast"], ["hbo max", "HBO MAX", "HBO Max"], ["google one", "GOOGLE *Google One", "Google One"], ["zelle to mom conf", "ZELLE TO MOM CONF# RECEAGTV", null]] as const)
  console.log(`rule "${stored}" matches tidied row?`, merchantKeys({ description: d, merchantName: tidy(d, m) }).includes(stored), "| untidied row?", merchantKeys({ description: d, merchantName: m }).includes(stored));
