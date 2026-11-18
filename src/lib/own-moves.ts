import { daysBetween } from "@/lib/dates";
import { personPaymentApp } from "@/lib/vendor";

/** A transaction as the pairing needs it. */
export type MoveRow = {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  merchantName: string | null;
  description: string;
  excluded?: boolean;
};

/** How far apart the two halves of one move can land (a Zelle out today can arrive at the other bank up to 3 days later). */
export const OWN_MOVE_DAYS = 3;

/** Apps a person moves their own money through (owner, 2026-11-18). PayPal is left out: its payouts are work. */
const OWN_MOVE_APPS = new Set(["Zelle", "Cash App", "Apple Cash", "Venmo"]);

/**
 * The person's own money moved between two of their accounts through a person-to-person app (owner, 2026-11-18): a Zelle
 * out of one bank and the same amount into another of their accounts within 3 days. Both halves are their own transfer,
 * never spending going out or money coming in. Each row pairs once; the closest dates pair first. Returns the ids of
 * both halves of every pair.
 */
export function ownMovePairs(rows: MoveRow[]): Set<string> {
  const viaApp = (r: MoveRow) => !r.excluded && OWN_MOVE_APPS.has(personPaymentApp(r.merchantName, r.description) ?? "");
  const outs = rows.filter((r) => r.amountCents < 0 && viaApp(r));
  const ins = rows.filter((r) => r.amountCents > 0 && viaApp(r));
  const candidates: { out: MoveRow; in: MoveRow; gap: number }[] = [];
  for (const o of outs)
    for (const i of ins) {
      if (i.accountId === o.accountId || i.amountCents !== -o.amountCents) continue;
      const gap = Math.abs(daysBetween(o.date, i.date));
      if (gap <= OWN_MOVE_DAYS) candidates.push({ out: o, in: i, gap });
    }
  candidates.sort((a, b) => a.gap - b.gap || a.out.date.localeCompare(b.out.date));
  const paired = new Set<string>();
  for (const c of candidates) {
    if (paired.has(c.out.id) || paired.has(c.in.id)) continue;
    paired.add(c.out.id);
    paired.add(c.in.id);
  }
  return paired;
}

/**
 * Money put into the person's own PayPal, Venmo or Cash App balance from their bank or card (owner, 2026-11-18): their own
 * money changing places, never spending. Read from the bank's line.
 */
export const isOwnTopUp = (description: string) =>
  /\b(add(ed)? (money|funds|cash)|top[- ]?up|load(ed)? (money|funds)|transfer to (paypal|venmo|cash ?app) balance|(paypal|venmo|cash ?app) (add|load) (money|funds))\b/i.test(
    description,
  );
