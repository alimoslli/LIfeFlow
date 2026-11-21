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
  kind: string;
  categoryId?: string | null;
  excluded?: boolean;
};

/** How far apart the two halves of one move can land (a Zelle out today can arrive at the other bank up to 3 days later). */
export const OWN_MOVE_DAYS = 3;

/** Apps a person moves their own money through (owner, 2026-11-18). PayPal is left out: its payouts are work. */
const OWN_MOVE_APPS = new Set(["Zelle", "Cash App", "Apple Cash", "Venmo"]);

const SELF_WORDS = /\b(self|own account|my account|to savings|from savings|to checking|from checking)\b/i;

/**
 * The line says the money is the person's own (QA, 2026-11-18: a Venmo to a friend and a sister's Zelle of the same amount
 * are not a move): it names the person (first and last name) or says self / own account. Anything else is left alone.
 */
export function namesSelf(description: string, ownName: string | null | undefined): boolean {
  if (SELF_WORDS.test(description)) return true;
  const parts = (ownName ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 1);
  if (parts.length < 2) return false;
  const words = new Set(description.toLowerCase().split(/[^a-z0-9']+/));
  return words.has(parts[0]) && words.has(parts[parts.length - 1]);
}

/**
 * The person's own money moved between two of their accounts through a person-to-person app (owner, 2026-11-18): money out of
 * one account and the same amount into another of theirs within 3 days, by the same app, with a line that says it's their own
 * (`namesSelf`). Both halves are their own transfer, never spending going out or money coming in. Pairs are one-to-one across
 * runs (QA F3): an incoming half already settled as a transfer keeps the out it pairs with before any new pair is made, and
 * the closest dates pair first. Rows the person categorized never pair (QA F1). Returns the ids of both halves of every pair.
 */
export function ownMovePairs(rows: MoveRow[], ownName: string | null | undefined): Set<string> {
  const app = (r: MoveRow) => {
    const a = personPaymentApp(r.merchantName, r.description);
    return a && OWN_MOVE_APPS.has(a) ? a : null;
  };
  const usable = (r: MoveRow) => !r.excluded && !r.categoryId && app(r) && namesSelf(r.description, ownName);
  const outs = rows.filter((r) => r.amountCents < 0 && usable(r));
  const ins = rows.filter((r) => r.amountCents > 0 && usable(r));
  const candidates: { out: MoveRow; in: MoveRow; gap: number; settled: boolean }[] = [];
  for (const o of outs)
    for (const i of ins) {
      if (i.accountId === o.accountId || i.amountCents !== -o.amountCents || app(i) !== app(o)) continue;
      const gap = Math.abs(daysBetween(o.date, i.date));
      if (gap <= OWN_MOVE_DAYS) candidates.push({ out: o, in: i, gap, settled: i.kind === "transfer" });
    }
  candidates.sort((a, b) => Number(b.settled) - Number(a.settled) || a.gap - b.gap || a.out.date.localeCompare(b.out.date) || a.in.id.localeCompare(b.in.id));
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
