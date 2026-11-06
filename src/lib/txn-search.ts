import { normalizeText } from "@/lib/utils";

/**
 * Forgiving transaction search. Bank lines are messy ("ZELLE TO MOUSSELLI OMAR 12345",
 * "Zelle payment to OMAR M Conf# x7k2", "ZELLE TRANSFER CONF 91827 OMAR MOUSSEL"), so a
 * search is split into words and every meaningful word must match somewhere, in any order.
 * Pure functions only: the SQL layer pre-filters, these decide.
 */

const FILLER = new Set([
  "a",
  "an",
  "and",
  "at",
  "did",
  "for",
  "from",
  "i",
  "in",
  "is",
  "last",
  "me",
  "my",
  "of",
  "on",
  "or",
  "paid",
  "pay",
  "payment",
  "payments",
  "send",
  "sent",
  "the",
  "time",
  "to",
  "was",
  "when",
  "with",
  "transfer",
  "transferred",
]);

/** Payment apps are hints only: a bank line may say "P2P" or "Online Transfer" instead. */
const APPS = new Set(["zelle", "venmo", "cashapp", "paypal", "p2p"]);

export type ParsedSearch = {
  /** Words that must each match. */
  terms: string[];
  /** Payment-app words the user mentioned (optional hints). */
  apps: string[];
};

export function words(s: string | null | undefined): string[] {
  return s ? normalizeText(s).split(" ").filter(Boolean) : [];
}

export function parseSearch(search: string): ParsedSearch {
  const all = words(
    search
      .replace(/cash\s*app/gi, "cashapp")
      .replace(/\bzelled\b/gi, "zelle")
      .replace(/\bvenmoed\b/gi, "venmo"),
  );
  const apps = all.filter((w) => APPS.has(w));
  let terms = all.filter((w) => !APPS.has(w) && !FILLER.has(w) && w.length > 1);
  // A search made only of app or filler words ("Zelle", "payments") still needs something to match.
  if (!terms.length) terms = apps.length ? apps : all;
  return { terms: [...new Set(terms)], apps };
}

export type SearchRow = { description?: string | null; merchantName?: string | null; notes?: string | null };

/** Word match: equal, a truncated bank word ("MOUSSEL" for "mousselli"), or a short suffix ("starbuck" / "STARBUCKS"). Never "omar" in "OMARKET". */
export function wordMatches(term: string, w: string): boolean {
  if (w === term) return true;
  if (w.length >= 4 && term.length > w.length && term.startsWith(w)) return true;
  return term.length >= 5 && w.startsWith(term) && w.length - term.length <= 2;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity of a search word to a bank word; a truncated bank word is compared with the same-length start of the search word. */
export function similarity(term: string, w: string): number {
  if (term.length < 3 || w.length < 3) return term === w ? 1 : 0;
  const sim = (a: string, b: string) => 1 - editDistance(a, b) / Math.max(a.length, b.length);
  let best = sim(term, w);
  if (w.length >= 4 && term.length > w.length) best = Math.max(best, sim(term.slice(0, w.length), w));
  return best;
}

/** A fuzzy word counts as a match above this similarity. */
export const FUZZY_THRESHOLD = 0.6;

type Hit = { field: number; index: number };

function matchTerm(term: string, fields: string[][], fuzzy: boolean): { score: number; hit?: Hit } {
  let best = 0;
  let hit: Hit | undefined;
  fields.forEach((ws, field) =>
    ws.forEach((w, index) => {
      const s = wordMatches(term, w) ? 1 : fuzzy ? similarity(term, w) : 0;
      if (s > best) {
        best = s;
        hit = { field, index };
      }
    }),
  );
  return { score: best, hit };
}

/**
 * Scores a row against the terms. Exact mode: `all` is true only when every term matches.
 * Fuzzy mode: `score` is the mean similarity and `all` says whether every term cleared the threshold.
 * A bare initial next to a matched word counts as the other name ("OMAR M" for "Omar Mousselli").
 */
export function scoreRow(terms: string[], row: SearchRow, fuzzy = false): { score: number; all: boolean } {
  if (!terms.length) return { score: 1, all: true };
  const fields = [words(row.description), words(row.merchantName), words(row.notes)];
  const results = terms.map((t) => matchTerm(t, fields, fuzzy));
  const pass = (s: number) => (fuzzy ? s > FUZZY_THRESHOLD : s >= 1);
  const ok = results.map((r) => pass(r.score));
  if (terms.length >= 2) {
    results.forEach((r, i) => {
      if (ok[i]) return;
      for (let j = 0; j < results.length; j++) {
        const h = results[j].hit;
        if (j === i || !ok[j] || !h) continue;
        const ws = fields[h.field];
        if (ws[h.index - 1] === terms[i][0] || ws[h.index + 1] === terms[i][0]) {
          ok[i] = true;
          r.score = Math.max(r.score, 0.9);
          return;
        }
      }
    });
  }
  return { score: results.reduce((s, r) => s + r.score, 0) / results.length, all: ok.every(Boolean) };
}

export function rowMatches(terms: string[], row: SearchRow): boolean {
  return scoreRow(terms, row, false).all;
}

/** Text any matching row must contain: the first 4 letters of a word (the whole word when shorter). */
export function prefilterNeedles(terms: string[]): string[] {
  return [...new Set(terms.map((t) => t.slice(0, 4)))];
}

/** ILIKE needles for person-to-person payment apps. */
export const P2P_NEEDLES = ["zelle", "venmo", "cash app", "cashapp", "paypal", "p2p"];
