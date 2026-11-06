import { addDaysStr, daysBetween } from "@/lib/dates";
import { detectRecurring, isBankFee, merchantKey, type DetectTxn } from "./recurring-detect";

/**
 * Things worth catching in a bank feed that people rarely notice themselves:
 * - possible double charges: a bill or subscription charged twice in one cycle, however long it has run;
 *   otherwise the same merchant and amount twice within 2 days (not pending copies, not things that
 *   normally repeat like coffee);
 * - bank fees: overdraft, NSF, ATM, late, foreign transaction and monthly service fees.
 * Facts only; wording lives in jarvis-voice.
 */
export type ScanTxn = DetectTxn & { id?: string };

/** Bank fees (overdraft, NSF, ATM, late, foreign transaction, monthly service): the same rule the bill finder uses to leave them out. */
export { isBankFee };

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
  // Money the merchant gave back: a double charge already refunded (or refunded and charged again) is settled.
  const refunds = txns.filter((t) => !t.pending && t.amountCents > 0 && (t.kind === "refund" || t.kind === "reimbursement"));
  const refunded = (a: ScanTxn, b: ScanTxn) =>
    refunds.some((r) => merchantKey(r) === merchantKey(a) && r.amountCents === -a.amountCents && r.date >= a.date && daysBetween(b.date, r.date) <= 14);
  const doubleCharges: { merchant: string; amountCents: number; dates: [string, string] }[] = [];
  const seen = new Set<string>();
  const series = detectRecurring(txns, { today });
  // Amounts a bill or subscription charges: whether two of them close together are a double charge is the series' call.
  const recurringAmount = new Set(series.flatMap((c) => c.charges.map((x) => `${c.merchantKey}|${x.amountCents}`)));
  // A recurring charge billed a second time beside its usual one (Spotify twice on Oct 15), even after years of history.
  for (const c of series)
    for (const d of c.duplicates) {
      const k = `${c.merchantKey}|${d.amountCents}`;
      if (seen.has(k) || d.dates[1] < from || d.dates[1] > today || -d.amountCents < 500 || isBankFee({ description: d.label, merchantName: null })) continue;
      seen.add(k);
      doubleCharges.push({ merchant: d.label, amountCents: -d.amountCents, dates: d.dates });
    }
  const sorted = [...recent].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (-a.amountCents < 500 || isBankFee(a)) continue;
    const k = `${merchantKey(a)}|${a.amountCents}`;
    if (seen.has(k) || recurringAmount.has(k) || (sameAmountDays.get(k)?.size ?? 0) > 3) continue;
    const b = sorted.slice(i + 1).find((x) => x !== a && `${merchantKey(x)}|${x.amountCents}` === k && daysBetween(a.date, x.date) <= 2);
    if (!b || refunded(a, b)) continue;
    seen.add(k);
    doubleCharges.push({ merchant: a.merchantName || a.description, amountCents: -a.amountCents, dates: [a.date, b.date] });
  }

  const fees = recent.filter(isBankFee).map((t) => ({ description: t.merchantName || t.description, amountCents: -t.amountCents, date: t.date }));
  return { doubleCharges, fees, feesTotalCents: fees.reduce((s, f) => s + f.amountCents, 0) };
}
