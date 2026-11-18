/**
 * What Bills says it costs a month (student test, 2026-11-16: it read "$0, nothing yet" while the bank showed four regular
 * charges and Money counted $607 of bills). Money's bills are the tracked ones plus the ones found in the bank
 * (`foundBills` in forecast.ts), so this counts both, from the same list the page shows: a found charge counts until the
 * person tracks it, and then it counts as the tracked bill, never twice (`suggestRecurring` leaves tracked ones out).
 * Money is integer cents; a month is the average month (52 weeks / 12).
 */

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

type Tracked = { amountCents: number; status: string; frequency: string };
type Found = { latestAmountCents: number; frequency: string; kind?: string };

/** A found charge that is a bill: money going out, not pennies (interest paid in isn't a bill), not income. */
export const isFoundBill = (c: Found) => c.latestAmountCents <= -100 && c.kind !== "income";

export function billsSummary(tracked: Tracked[], found: Found[]) {
  const monthlyOf = (cents: number, frequency: string) => -cents * (PER_MONTH[frequency] ?? 1);
  const trackedOut = tracked.filter((i) => i.amountCents < 0 && i.status === "active");
  const foundOut = found.filter(isFoundBill);
  const monthlyCents = Math.round(
    trackedOut.reduce((sum, i) => sum + monthlyOf(i.amountCents, i.frequency), 0) +
      foundOut.reduce((sum, c) => sum + monthlyOf(c.latestAmountCents, c.frequency), 0),
  );
  return {
    monthlyCents,
    yearlyCents: monthlyCents * 12,
    count: trackedOut.length + foundOut.length,
    trackedCount: trackedOut.length,
    foundCount: foundOut.length,
  };
}
