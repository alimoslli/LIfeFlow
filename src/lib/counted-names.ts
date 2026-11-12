import { wordMatches, words } from "@/lib/txn-search";

/**
 * The exact names a search total counted, so the answer can say who the money went to ("$240 to Omar Haddad and
 * OMAR H ZELLE, 6 payments"). Names are the row's own text (merchant if there is one, else the bank line), grouped only
 * when they are identical, never by similarity, so two people with alike names stay two entries. Integer cents.
 */
export type CountedName = { name: string; count: number; paidCents: number; receivedCents: number };

type Row = { description: string; merchantName?: string | null; notes?: string | null; amountCents: number; kind?: string };

/** Names longer than this are cut (a bank line can be long and is shown to the model). */
const MAX_NAME = 80;

/** The row's text that says who it was: the field carrying the most search words (the tidied merchant is just "Zelle" for a Zelle line); the merchant wins a tie. */
function nameOf(r: Row, terms: string[]): string {
  const fields = [r.merchantName, r.description, r.notes].map((f) => f?.trim() ?? "").filter(Boolean);
  const covered = (f: string) => {
    const ws = words(f);
    return terms.filter((t) => ws.some((w) => wordMatches(t, w))).length;
  };
  return fields.reduce((best, f) => (covered(f) > covered(best) ? f : best), fields[0] ?? r.description);
}

/**
 * Each row counts exactly where summarizeCashflow counts it: an expense adds to paid, a refund or reimbursement takes
 * from paid, income adds to received. Transfers, investments and adjustments feed neither total, so they are only
 * tallied in `leftOut` (count and absolute cents), never in a name. Without a kind, the sign decides.
 */
export function countedNames(rows: Row[], terms: string[] = []): { names: CountedName[]; leftOut: { count: number; cents: number } } {
  const byName = new Map<string, CountedName>();
  const leftOut = { count: 0, cents: 0 };
  for (const r of rows) {
    const kind = r.kind ?? (r.amountCents < 0 ? "expense" : "income");
    if (!["expense", "refund", "reimbursement", "income"].includes(kind)) {
      leftOut.count++;
      leftOut.cents += Math.abs(r.amountCents);
      continue;
    }
    const name = nameOf(r, terms).slice(0, MAX_NAME);
    const n = byName.get(name) ?? { name, count: 0, paidCents: 0, receivedCents: 0 };
    n.count++;
    if (kind === "income") n.receivedCents += r.amountCents;
    else n.paidCents -= r.amountCents;
    byName.set(name, n);
  }
  const names = [...byName.values()].sort((a, b) => b.paidCents + b.receivedCents - (a.paidCents + a.receivedCents) || a.name.localeCompare(b.name));
  return { names, leftOut };
}
