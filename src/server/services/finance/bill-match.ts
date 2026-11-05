import { daysBetween } from "@/lib/dates";
import type { Frequency } from "../../db/schema";
import { merchantKey, merchantKeys, nextOccurrence, type RecurringCandidate } from "./recurring-detect";

/**
 * Is it the same bill? Pure rules for telling when a bill the user tracks under their own name
 * ("Rent, Parkview Apartments") is the one the bank reports ("PARKVIEW APARTMENTS RENT"), so
 * money is counted once.
 */

/** How far apart two dates on one schedule may sit and still be the same bill; also how early a charge may post and still pay that cycle. */
export const SLACK_DAYS: Record<Frequency, number> = { weekly: 1, biweekly: 2, monthly: 5, quarterly: 7, yearly: 10 };

/** The keys a tracked item goes by: the stored one (older items keep the previous format) and its name's. */
export function trackedKeys(item: { name: string; merchantKey?: string | null }): string[] {
  return [...new Set([item.merchantKey, merchantKey({ merchantName: item.name, description: item.name })].filter((k): k is string => !!k))];
}

const words = (key: string) => new Set(key.split(" ").filter(Boolean));
const inside = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((w) => b.has(w));

/** "same" when two keys are equal, "contained" when every word of one is in the other ("parkview apartments" in "rent parkview apartments"). */
export function nameRelation(a: string[], b: string[]): "same" | "contained" | null {
  if (a.some((k) => k && b.includes(k))) return "same";
  for (const x of a)
    for (const y of b) {
      const [wx, wy] = [words(x), words(y)];
      if (inside(wx, wy) || inside(wy, wx)) return "contained";
    }
  return null;
}

/** Same direction and within 10% or $2 of what's expected; within 25% for a bill whose amount moves (utilities, phone). */
export function amountsClose(expectedCents: number, actualCents: number, varies: boolean): boolean {
  if (Math.sign(expectedCents) !== Math.sign(actualCents)) return false;
  return Math.abs(actualCents - expectedCents) <= Math.max(Math.abs(expectedCents) * (varies ? 0.25 : 0.1), 200);
}

/** Days between the nearest occurrences of two dates on the same schedule (Dec 1 and Jan 2, monthly: 1). */
export function scheduleGap(a: string, b: string, freq: Frequency): number {
  const hi = a <= b ? b : a;
  let lo = a <= b ? a : b;
  let gap = daysBetween(lo, hi);
  for (let guard = 0; lo < hi && guard < 600; guard++) {
    lo = nextOccurrence(lo, freq);
    gap = Math.min(gap, Math.abs(daysBetween(lo, hi)));
  }
  return gap;
}

/**
 * A series found in the bank is a bill the user already tracks when it has the tracked key, or when one
 * name holds the other and it also bills the same amount on the same schedule. Amount and day are what
 * keep two different bills from one landlord or merchant (rent and parking) apart; amount and day alone
 * never make a match (Netflix and Hulu can both be $15.49 on the 15th).
 */
export function tracksSeries(
  item: { name: string; merchantKey: string | null; amountCents: number; frequency: Frequency; nextDueDate: string | null },
  c: RecurringCandidate,
): boolean {
  const rel = nameRelation(trackedKeys(item), [c.merchantKey]);
  if (rel === "same") return true;
  if (!rel || !item.nextDueDate || item.frequency !== c.frequency) return false;
  const close = amountsClose(item.amountCents, c.latestAmountCents, c.variableAmount) || amountsClose(item.amountCents, c.averageAmountCents, c.variableAmount);
  return close && scheduleGap(item.nextDueDate, c.nextExpectedDate, item.frequency) <= SLACK_DAYS[item.frequency];
}

/** One due date of a tracked item. */
export type DueOccurrence = { name: string; merchantKey: string | null; kind: string; frequency: Frequency; date: string; amountCents: number };
export type PostedCharge = { date: string; amountCents: number; merchantName: string | null; description: string; kind: string; pending: boolean };

/** Rows that never pay a bill: they undo or correct other money. */
const NOT_A_PAYMENT = new Set(["refund", "reimbursement", "adjustment"]);

/**
 * The due dates (indexes into `due`) a posted charge already paid: the same bill by name, a close amount,
 * on the due date or up to SLACK_DAYS before it. A bill under its exact bank name may vary like a utility
 * (25%); a name inside the other has to hold its amount. Pending charges don't count yet. Each charge pays
 * one due date, closest amount first, so two bills from one merchant can't share a payment.
 */
export function paidOccurrences(due: DueOccurrence[], charges: PostedCharge[]): Set<number> {
  const pairs: { o: number; c: number; score: number }[] = [];
  charges.forEach((t, c) => {
    if (t.pending || NOT_A_PAYMENT.has(t.kind)) return;
    const keys = merchantKeys(t);
    due.forEach((d, o) => {
      const early = daysBetween(t.date, d.date);
      if (early < 0 || early > SLACK_DAYS[d.frequency]) return;
      const rel = nameRelation(trackedKeys(d), keys);
      if (!rel || !amountsClose(d.amountCents, t.amountCents, rel === "same" && d.kind === "bill")) return;
      pairs.push({ o, c, score: Math.abs(t.amountCents - d.amountCents) / Math.abs(d.amountCents) + early / 1000 });
    });
  });
  const paid = new Set<number>();
  const used = new Set<number>();
  for (const p of pairs.sort((a, b) => a.score - b.score))
    if (!paid.has(p.o) && !used.has(p.c)) {
      paid.add(p.o);
      used.add(p.c);
    }
  return paid;
}
