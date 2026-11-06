import { daysBetween } from "@/lib/dates";
import type { Frequency } from "../../db/schema";
import { merchantKey, merchantKeys, nthOccurrence, storedKeyForms, type RecurringCandidate } from "./recurring-detect";

/**
 * Is it the same bill? Pure rules for telling when a bill the user tracks under their own name
 * ("Rent, Parkview Apartments") is the one the bank reports ("PARKVIEW APARTMENTS RENT"), so
 * money is counted once.
 */

/** How far apart two dates on one schedule may sit and still be the same bill. */
export const SLACK_DAYS: Record<Frequency, number> = { weekly: 1, biweekly: 2, monthly: 5, quarterly: 7, yearly: 10 };

/**
 * How many days before its due date a charge may post and still pay that cycle (rent paid a week ahead).
 * Always under half the period, so a charge only ever pays the due date it's nearest.
 */
export const PAID_EARLY_DAYS: Record<Frequency, number> = { weekly: 1, biweekly: 2, monthly: 10, quarterly: 10, yearly: 10 };

/**
 * The keys a tracked item goes by: the stored one (older items keep the previous format, and its brand's key when
 * the vendor tidy renamed it, "comcast" → "xfinity") and its name's.
 */
export function trackedKeys(item: { name: string; merchantKey?: string | null }): string[] {
  return [...new Set([...storedKeyForms(item.merchantKey), merchantKey({ merchantName: item.name, description: item.name })].filter((k): k is string => !!k))];
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

/** Same direction and within 10% (at least 50 cents) of what's expected; within 25% for a bill whose amount moves (utilities, phone). */
export function amountsClose(expectedCents: number, actualCents: number, varies: boolean): boolean {
  if (Math.sign(expectedCents) !== Math.sign(actualCents)) return false;
  return Math.abs(actualCents - expectedCents) <= Math.max(Math.abs(expectedCents) * (varies ? 0.25 : 0.1), 50);
}

/** Categories whose bills usually move from one to the next (usage, overage). */
const USUALLY_VARIES = /^(?:utilities|phone|internet)$/i;

/**
 * Whether a tracked bill's amount moves: its found series' charges tell, and before the bank shows a series (a bill
 * tracked by hand, no history yet), its category does. With no series, a charge can pay it only under the bill's own
 * keys (its name's, its stored one or its brand's: `paidOccurrences`), so the wider band never reaches another merchant.
 */
export function billVaries(series: { variableAmount: boolean }[], category: string | null | undefined): boolean {
  return series.length ? series.some((c) => c.variableAmount) : USUALLY_VARIES.test(category?.trim() ?? "");
}

/** Signed days from the nearest occurrence of `anchor`'s schedule to `date`: negative when `date` comes before it. */
export function scheduleOffset(anchor: string, freq: Frequency, date: string): number {
  // Walk the earlier date forward on the schedule (keeping its day of the month) until it passes the other, keeping the smallest gap.
  const forward = anchor <= date;
  const target = forward ? date : anchor;
  const start = forward ? anchor : date;
  let best = daysBetween(start, target);
  for (let n = 1, x = start; x < target && n <= 600; n++) {
    x = nthOccurrence(start, freq, n);
    const gap = daysBetween(x, target);
    if (Math.abs(gap) < Math.abs(best)) best = gap;
  }
  return forward ? best : -best;
}

/** Days between the nearest occurrences of two dates on the same schedule (Dec 1 and Jan 2, monthly: 1). */
export function scheduleGap(a: string, b: string, freq: Frequency): number {
  return Math.abs(scheduleOffset(a, freq, b));
}

/**
 * A series found in the bank is a bill the user already tracks when money moves the same way and it has
 * the tracked key, or when one name holds the other and it also bills the same amount on the same schedule.
 * Amount and day are what keep two different bills from one landlord or merchant (rent and parking) apart;
 * amount and day alone never make a match (Netflix and Hulu can both be $15.49 on the 15th), except for a
 * series paid by transfer, whose line never carries the user's own name for the bill.
 */
export function tracksSeries(
  item: { name: string; merchantKey: string | null; amountCents: number; frequency: Frequency; nextDueDate: string | null },
  c: RecurringCandidate,
): boolean {
  // Pay from a university never hides the tuition paid to it.
  if (Math.sign(item.amountCents) !== Math.sign(c.latestAmountCents)) return false;
  const rel = nameRelation(trackedKeys(item), [c.merchantKey]);
  if (rel === "same") return true;
  // Money sent by transfer posts under the bank's wording ("ZELLE TO JORDAN M", "GRANITE FCU AUTO LOAN PMT"), never
  // the user's name for it ("Rent", "Car loan"): for those, the same amount on the same schedule is enough.
  if ((!rel && !c.transfer) || !item.nextDueDate || item.frequency !== c.frequency) return false;
  const close = amountsClose(item.amountCents, c.latestAmountCents, c.variableAmount) || amountsClose(item.amountCents, c.averageAmountCents, c.variableAmount);
  const onSchedule = scheduleGap(item.nextDueDate, c.nextExpectedDate, item.frequency) <= SLACK_DAYS[item.frequency];
  // The last charge paid a due date early (rent a week ahead), which moves the series' next date.
  const lastOffset = scheduleOffset(item.nextDueDate, item.frequency, c.lastDate);
  const paidEarly = lastOffset <= 0 && -lastOffset <= PAID_EARLY_DAYS[item.frequency];
  return close && (onSchedule || paidEarly);
}

/**
 * One due date of a tracked item. `keys` are the item's own keys plus those of bank series already matched
 * to it (`tracksSeries`); `varies` is true when its amount moves from bill to bill (`billVaries`).
 */
export type DueOccurrence = { keys: string[]; varies: boolean; frequency: Frequency; date: string; amountCents: number };
export type PostedCharge = { date: string; amountCents: number; merchantName: string | null; description: string; kind: string; pending: boolean };

/** Rows that never pay a bill: they undo or correct other money. */
const NOT_A_PAYMENT = new Set(["refund", "reimbursement", "adjustment"]);

/**
 * The due dates (indexes into `due`) a posted charge already paid: a charge under one of the item's exact
 * keys (never a merchant name merely inside it, so an Amazon purchase can't pay Amazon Prime), a close
 * amount, on the due date or up to PAID_EARLY_DAYS before it. Pending charges don't count yet. Each charge
 * pays one due date, closest amount first, so two bills from one merchant can't share a payment.
 */
export function paidOccurrences(due: DueOccurrence[], charges: PostedCharge[]): Set<number> {
  const pairs: { o: number; c: number; score: number }[] = [];
  charges.forEach((t, c) => {
    if (t.pending || NOT_A_PAYMENT.has(t.kind)) return;
    const keys = merchantKeys(t);
    due.forEach((d, o) => {
      const early = daysBetween(t.date, d.date);
      if (early < 0 || early > PAID_EARLY_DAYS[d.frequency]) return;
      if (!keys.some((k) => d.keys.includes(k)) || !amountsClose(d.amountCents, t.amountCents, d.varies)) return;
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
