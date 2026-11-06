import { detectRecurring, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { addDaysStr } from "@/lib/dates";
const chk = { accountId: "c", accountType: "credit", accountMask: "1" };
// next business day posting like the simulator: Sat/Sun -> Monday
const post = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 6 ? addDaysStr(d, 2) : w === 0 ? addDaysStr(d, 1) : d; };
const txns: DetectTxn[] = [];
for (let m = 0; m < 14; m++) {
  const y = 2025 + Math.floor((9 + m) / 12), mo = ((9 + m) % 12) + 1;
  const ds = (day: number) => `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  txns.push({ date: post(ds(24)), description: "APPLE.COM/BILL", merchantName: "Apple", amountCents: -299, kind: "expense", categoryName: "Software", ...chk });
  txns.push({ date: post(ds(10)), description: "APPLE.COM/BILL", merchantName: "Apple", amountCents: -1099, kind: "expense", categoryName: "Software", ...chk });
}
const seen = new Map<string, string>();
for (let d = "2026-05-01"; d <= "2026-11-05"; d = addDaysStr(d, 1)) {
  const keys = detectRecurring(txns.filter((t) => t.date <= d), { today: d }).map((c) => c.seriesKey).sort().join(",");
  if (seen.get("last") !== keys) { console.log(d, keys); seen.set("last", keys); }
}
