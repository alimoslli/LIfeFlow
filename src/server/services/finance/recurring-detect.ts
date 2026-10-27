import type { Frequency } from "../../db/schema";
import { normalizeText } from "@/lib/utils";
import { addDaysStr, daysBetween } from "@/lib/dates";

export type DetectTxn = { date: string; amountCents: number; merchantName: string | null; description: string; kind: string };

export type RecurringCandidate = {
  merchantKey: string;
  name: string;
  frequency: Frequency;
  averageAmountCents: number;
  occurrences: number;
  lastDate: string;
  nextExpectedDate: string;
  confidence: number;
};

const PERIODS: { freq: Frequency; days: number; tolerance: number }[] = [
  { freq: "weekly", days: 7, tolerance: 1 },
  { freq: "biweekly", days: 14, tolerance: 2 },
  { freq: "monthly", days: 30.4, tolerance: 4 },
  { freq: "quarterly", days: 91, tolerance: 7 },
  { freq: "yearly", days: 365, tolerance: 10 },
];

/** Strips trailing ids/numbers so "NETFLIX.COM 8843" and "Netflix.com 1234" group together. */
export function merchantKey(t: Pick<DetectTxn, "merchantName" | "description">): string {
  const base = normalizeText(t.merchantName || t.description);
  return base.replace(/\b\d{3,}\b/g, "").replace(/\s+/g, " ").trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Finds series of transactions from the same merchant at a regular interval
 * with similar amounts. Requires at least 3 occurrences (2 for yearly).
 */
export function detectRecurring(txns: DetectTxn[]): RecurringCandidate[] {
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.kind === "transfer" || t.kind === "adjustment") continue;
    const key = merchantKey(t);
    if (!key) continue;
    // keep inflows and outflows apart
    const k = `${key}|${t.amountCents < 0 ? "out" : "in"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const out: RecurringCandidate[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date));
    const gap = median(gaps);
    const period = PERIODS.find((p) => Math.abs(gap - p.days) <= p.tolerance);
    if (!period) continue;
    if (sorted.length < (period.freq === "yearly" ? 2 : 3)) continue;
    const regular = gaps.filter((g) => Math.abs(g - period.days) <= period.tolerance * 1.5).length / gaps.length;
    const amounts = sorted.map((t) => t.amountCents);
    const med = median(amounts);
    const amountStable = amounts.filter((a) => Math.abs(a - med) <= Math.max(Math.abs(med) * 0.15, 100)).length / amounts.length;
    const confidence = Math.round(regular * amountStable * Math.min(1, sorted.length / 4) * 100) / 100;
    if (confidence < 0.5) continue;
    const last = sorted[sorted.length - 1];
    out.push({
      merchantKey: k.split("|")[0],
      name: last.merchantName || last.description,
      frequency: period.freq,
      averageAmountCents: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
      occurrences: sorted.length,
      lastDate: last.date,
      nextExpectedDate: addDaysStr(last.date, Math.round(period.days)),
      confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Advances a due date by a frequency. */
export function nextOccurrence(date: string, freq: Frequency): string {
  const [y, m, d] = date.split("-").map(Number);
  const addMonths = (n: number) => {
    const target = new Date(Date.UTC(y, m - 1 + n, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  };
  switch (freq) {
    case "weekly":
      return addDaysStr(date, 7);
    case "biweekly":
      return addDaysStr(date, 14);
    case "monthly":
      return addMonths(1);
    case "quarterly":
      return addMonths(3);
    case "yearly":
      return addMonths(12);
  }
}
