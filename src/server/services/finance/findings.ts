import { addDaysStr, daysBetween } from "@/lib/dates";
import { merchantKey, type DetectTxn } from "./recurring-detect";

/**
 * Things worth catching in a bank feed that people rarely notice themselves:
 * - possible double charges: the same merchant and amount twice within 2 days
 *   (not pending copies, not things that normally repeat like coffee);
 * - bank fees: overdraft, NSF, ATM, late, foreign transaction and monthly service fees.
 * Facts only; wording lives in jarvis-voice.
 */
export type ScanTxn = DetectTxn & { id?: string };

const FEE =
  /\b(overdraft|od fee|nsf|insufficient funds|returned item|atm (?:fee|surcharge|withdrawal fee)|non-?network atm|late (?:fee|charge|payment fee)|foreign (?:transaction|exchange) fee|intl? (?:transaction )?fee|monthly (?:service|maintenance) fee|maintenance fee|service charge|paper statement fee)\b/i;

export function isBankFee(t: Pick<ScanTxn, "description" | "merchantName" | "categoryName">) {
  return FEE.test(`${t.description} ${t.merchantName ?? ""}`);
}

export function scanTransactions(txns: ScanTxn[], today: string, opts: { days?: number } = {}) {
  const from = addDaysStr(today, -(opts.days ?? 30));
  const posted = txns.filter((t) => !t.pending && t.amountCents < 0 && t.kind !== "transfer");
  const recent = posted.filter((t) => t.date >= from && t.date <= today);

  // How often each merchant normally charges this exact amount: a daily latte at the same price isn't a double charge.
  const sameAmountDays = new Map<string, Set<string>>();
  for (const t of posted) {
    const k = `${merchantKey(t)}|${t.amountCents}`;
    sameAmountDays.set(k, (sameAmountDays.get(k) ?? new Set()).add(t.date));
  }
  const doubleCharges: { merchant: string; amountCents: number; dates: [string, string] }[] = [];
  const seen = new Set<string>();
  const sorted = [...recent].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (-a.amountCents < 500 || isBankFee(a)) continue;
    const k = `${merchantKey(a)}|${a.amountCents}`;
    if (seen.has(k) || (sameAmountDays.get(k)?.size ?? 0) > 3) continue;
    const b = sorted.slice(i + 1).find((x) => x !== a && `${merchantKey(x)}|${x.amountCents}` === k && daysBetween(a.date, x.date) <= 2);
    if (!b) continue;
    seen.add(k);
    doubleCharges.push({ merchant: a.merchantName || a.description, amountCents: -a.amountCents, dates: [a.date, b.date] });
  }

  const fees = recent.filter(isBankFee).map((t) => ({ description: t.merchantName || t.description, amountCents: -t.amountCents, date: t.date }));
  return { doubleCharges, fees, feesTotalCents: fees.reduce((s, f) => s + f.amountCents, 0) };
}
