import { addDaysStr, daysBetween } from "@/lib/dates";
import type { Frequency } from "../../db/schema";
import { DUPLICATE_DAYS, merchantKey, merchantKeys, nthOccurrence, storedKeyForms, type RecurringCandidate } from "./recurring-detect";

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

/** Categories whose bills usually move from one to the next (usage). Phone and internet are not here: their amounts are steady, and a wide band lets the brand's other products pay them. */
const USUALLY_VARIES = /^utilities$/i;

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
 * to it (`tracksSeries`), and `series` those series' `seriesKey`s; `varies` is true when its amount moves from bill
 * to bill (`billVaries`). `day` is the schedule's day of the month when `date` was moved to a short month's last day
 * (a bill due the 31st is due Feb 28), so the cycle before it is Jan 31, not Jan 28.
 */
export type DueOccurrence = { keys: string[]; varies: boolean; frequency: Frequency; date: string; amountCents: number; series?: string[]; day?: number };
/** A posted transaction; `series` is the found series it's a cycle of (its `seriesKey`), if any. */
export type PostedCharge = {
  date: string;
  amountCents: number;
  merchantName: string | null;
  description: string;
  kind: string;
  pending: boolean;
  series?: string | null;
};

/** Rows that never pay a bill: they undo or correct other money. */
const NOT_A_PAYMENT = new Set(["refund", "reimbursement", "adjustment"]);

/**
 * The due dates (indexes into `due`) a posted charge already paid: a charge under one of the item's exact
 * keys (never a merchant name merely inside it, so an Amazon purchase can't pay Amazon Prime), a close
 * amount, on the due date or up to PAID_EARLY_DAYS before it. Pending charges don't count yet. Each charge
 * pays one due date, closest amount and then nearest date first, so two bills from one merchant can't share a payment
 * (pass the due dates just before the range too: a charge that paid one of those can't pay a later one).
 *
 * A charge that's another bill's own never pays this one (a second $15.49 Netflix plan billed a week earlier): one in a
 * found series that isn't the item's, or one that repeats a charge of the previous cycle that wasn't this bill's payment
 * then (`repeatsOther`). `charges` should reach back a cycle for that.
 */
export function paidOccurrences(due: DueOccurrence[], charges: PostedCharge[]): Set<number> {
  const keys: string[][] = [];
  const fits = (d: DueOccurrence, c: number) => {
    const t = charges[c];
    if (t.pending || NOT_A_PAYMENT.has(t.kind) || (t.series && !d.series?.includes(t.series))) return false;
    return (keys[c] ??= merchantKeys(t)).some((k) => d.keys.includes(k)) && amountsClose(d.amountCents, t.amountCents, d.varies);
  };
  const score = (d: DueOccurrence, c: number, date: string) =>
    Math.abs(charges[c].amountCents - d.amountCents) / Math.abs(d.amountCents) + daysBetween(charges[c].date, date) / 1000;
  /** The charges that could pay `d` if it were due on `date`, best first. */
  const payers = (d: DueOccurrence, date: string) => {
    const start = addDaysStr(date, -PAID_EARLY_DAYS[d.frequency]);
    return charges.flatMap((t, c) => (t.date >= start && t.date <= date && fits(d, c) ? [c] : [])).sort((a, b) => score(d, a, date) - score(d, b, date));
  };
  /**
   * The previous cycle was paid by one charge, and another one (more than a double charge's 2 days from it) sits nearer
   * to this charge's place a cycle back (as many days before that due date): this charge is that one's next cycle, a different bill from the same merchant.
   */
  /** A refund or reimbursement under the bill's keys within a week after `u`: that charge was taken back, so it isn't another plan's. */
  const undone = (d: DueOccurrence, u: PostedCharge) =>
    charges.some(
      (r, ri) =>
        NOT_A_PAYMENT.has(r.kind) &&
        !r.pending &&
        r.kind !== "adjustment" &&
        r.date >= u.date &&
        r.date <= addDaysStr(u.date, 7) &&
        (keys[ri] ??= merchantKeys(r)).some((k) => d.keys.includes(k)),
    );
  const repeatsOther = (d: DueOccurrence, c: number) => {
    const before = nthOccurrence(d.date, d.frequency, -1, d.day);
    const [payment] = payers(d, before);
    if (payment === undefined) return false;
    // The same number of days before the due date, a cycle back (not the charge's own date a month back: months differ in length).
    const back = addDaysStr(before, -daysBetween(charges[c].date, d.date));
    const off = (u: number) => Math.abs(daysBetween(charges[u].date, back));
    // Only a charge from before that cycle's due date counts: one after it can't be an early payment of that cycle.
    return charges.some(
      (u, i) =>
        i !== payment &&
        u.date <= before &&
        off(i) <= SLACK_DAYS[d.frequency] &&
        off(i) < off(payment) &&
        Math.abs(daysBetween(u.date, charges[payment].date)) > DUPLICATE_DAYS &&
        fits(d, i) &&
        // The strict band even for a varying bill: its parts or a late fee are not another plan.
        amountsClose(charges[c].amountCents, u.amountCents, false) &&
        !undone(d, u),
    );
  };
  const pairs = due.flatMap((d, o) =>
    payers(d, d.date)
      .filter((c) => !repeatsOther(d, c))
      .map((c) => ({ o, c, score: score(d, c, d.date) })),
  );
  const paid = new Set<number>();
  const used = new Set<number>();
  for (const p of pairs.sort((a, b) => a.score - b.score))
    if (!paid.has(p.o) && !used.has(p.c)) {
      paid.add(p.o);
      used.add(p.c);
    }
  return paid;
}
