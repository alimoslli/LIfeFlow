import { wordMatches, words } from "@/lib/txn-search";

/**
 * The exact names a search total counted, so the answer can say who the money went to ("$240 to Omar Haddad and
 * OMAR H ZELLE, 6 payments"). Names are the row's own text (merchant if there is one, else the bank line), grouped only
 * when they are identical, never by similarity, so two people with alike names stay two entries. Integer cents.
 */
export type CountedName = { name: string; count: number; paidCents: number; receivedCents: number };

type Row = { description: string; merchantName?: string | null; notes?: string | null; amountCents: number };

/** The row's text that says who it was: the field carrying the most search words (the tidied merchant is just "Zelle" for a Zelle line); the merchant wins a tie. */
function nameOf(r: Row, terms: string[]): string {
  const fields = [r.merchantName, r.description, r.notes].map((f) => f?.trim() ?? "").filter(Boolean);
  const covered = (f: string) => {
    const ws = words(f);
    return terms.filter((t) => ws.some((w) => wordMatches(t, w))).length;
  };
  return fields.reduce((best, f) => (covered(f) > covered(best) ? f : best), fields[0] ?? r.description);
}

export function countedNames(rows: Row[], terms: string[] = []): CountedName[] {
  const byName = new Map<string, CountedName>();
  for (const r of rows) {
    const name = nameOf(r, terms);
    const n = byName.get(name) ?? { name, count: 0, paidCents: 0, receivedCents: 0 };
    n.count++;
    if (r.amountCents < 0) n.paidCents += -r.amountCents;
    else n.receivedCents += r.amountCents;
    byName.set(name, n);
  }
  return [...byName.values()].sort((a, b) => b.paidCents + b.receivedCents - (a.paidCents + a.receivedCents) || a.name.localeCompare(b.name));
}
