import { detectRecurring, nthOccurrence, type DetectTxn } from "@/server/services/finance/recurring-detect";
import { tracksSeries } from "@/server/services/finance/bill-match";
const chk = { accountId: "chk", accountType: "depository", accountMask: "1111" };
const mk = (desc: string, cents: number, day: number) => Array.from({ length: 4 }, (_, i) => ({ date: nthOccurrence(`2026-07-${String(day).padStart(2, "0")}`, "monthly", i), description: desc, merchantName: null, amountCents: -cents, kind: "transfer", categoryName: null, ...chk }) as DetectTxn);
const all = detectRecurring([...mk("ZELLE TO JORDAN M CONF# 8X2", 60000, 1), ...mk("GRANITE FCU AUTO LOAN PMT", 38900, 10), ...mk("VENMO PAYMENT 1234567", 4500, 15)]);
const items = [
  { name: "Rent", merchantKey: "rent", amountCents: -60000, frequency: "monthly" as const, nextDueDate: "2026-11-01" },
  { name: "Car loan", merchantKey: "car loan", amountCents: -38900, frequency: "monthly" as const, nextDueDate: "2026-11-10" },
  { name: "Utilities share", merchantKey: "utilities share", amountCents: -4500, frequency: "monthly" as const, nextDueDate: "2026-11-15" },
];
for (const it of items) console.log(it.name, "->", all.filter((c) => tracksSeries(it, c)).map((c) => c.seriesKey), " | found series:", all.map((c) => c.seriesKey + " " + c.latestAmountCents).join(", "));
