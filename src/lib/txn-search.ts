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
  /**
   * True when the words can't carry the search (other alphabets, a lone letter): the caller must match the raw
   * text as one phrase instead, and never drop the filter.
   */
  phrase: boolean;
};

/** Letters Unicode decomposition leaves alone. */
const EXTRA_FOLD: Record<string, string> = { ł: "l", ø: "o", đ: "d", ð: "d", æ: "ae", œ: "oe", ß: "ss", ı: "i", þ: "th" };
/** The same accent folding for SQL `translate()` (stored text is not folded in the database). */
export const ACCENT_FROM = "áàâäãåāéèêëēíìîïīóòôöõōøúùûüūñçýÿšžłđ";
/** Marks the matcher deletes so names join up (L'Osteria, O'BRIEN); SQL deletes the same ones. */
export const IGNORED_MARKS = "'\u2019`";
export const ACCENT_TO = "aaaaaaaeeeeeiiiiiooooooouuuuuncyyszld";

export function words(s: string | null | undefined): string[] {
  if (!s) return [];
  const folded = s
    .toLowerCase()
    .replace(/['\u2019`]/g, "") // O'BRIEN is one name (keep in step with IGNORED_MARKS)
    .replace(/cash\s*app/g, "cashapp")
    .replace(/[łøđðæœßıþ]/g, (c) => EXTRA_FOLD[c]);
  return normalizeText(folded).split(" ").filter(Boolean);
}

export function parseSearch(search: string): ParsedSearch {
  const all = words(search.replace(/\bzelled\b/gi, "zelle").replace(/\bvenmoed\b/gi, "venmo"));
  const apps = all.filter((w) => APPS.has(w));
  const rest = all.filter((w) => !APPS.has(w) && !FILLER.has(w));
  const terms = rest.filter((w) => w.length > 1);
  // Another alphabet (the folding would drop it), or a lone letter next to nothing usable.
  const nonLatin = /\p{L}/u.test(search.replace(/\p{Script=Latin}/gu, ""));
  const lone = rest.length > terms.length && !terms.length;
  if (nonLatin || lone) return { terms: [], apps, phrase: true };
  // Only app or filler words ("Zelle", "payments") still need something to match.
  if (!terms.length) return { terms: apps.length ? apps : all, apps, phrase: !all.length };
  return { terms: [...new Set(terms)], apps, phrase: false };
}

export type SearchRow = { description?: string | null; merchantName?: string | null; notes?: string | null };

/** 2 = the same word, 3 = its plural (sure for merchants, not for people: Nichola is not Nicholas), 1 = a shortened bank word of 5+ letters ("MOUSSEL" for "mousselli"), 0 = no match. "samir" is not "samira"; "omar" is not "OMARKET". */
export function wordKind(term: string, w: string): 0 | 1 | 2 | 3 {
  if (w === term) return 2;
  if (term.length >= 4 && w.length >= 4 && (w === term + "s" || w === term + "es" || term === w + "s" || term === w + "es")) return 3;
  if (w.length >= 5 && term.length > w.length && term.startsWith(w)) return 1;
  return 0;
}

export function wordMatches(term: string, w: string): boolean {
  return wordKind(term, w) > 0;
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

/** Typos allowed in a word: none under 5 letters (Sam is not Pam), one for 5 to 7, two from 8. */
export function typoBudget(len: number): number {
  return len < 5 ? 0 : len < 8 ? 1 : 2;
}

/**
 * 0..1 similarity of a search word to a bank word, 0 when it needs more typos than the word allows.
 * A truncated bank word is compared with the same-length start of the search word.
 */
export function similarity(term: string, w: string): number {
  if (term === w) return 1;
  const score = (a: string, b: string) => {
    const d = editDistance(a, b);
    return d <= typoBudget(Math.min(a.length, b.length)) ? 1 - d / Math.max(a.length, b.length) : 0;
  };
  let best = score(term, w);
  if (w.length >= 5 && term.length > w.length) best = Math.max(best, score(term.slice(0, w.length), w));
  return best;
}

/** A fuzzy word counts as a match above this similarity (0 means over the typo budget). */
export const FUZZY_THRESHOLD = 0.6;

type Hit = { field: number; index: number };

function matchTerm(term: string, fields: string[][], fuzzy: boolean): { score: number; strong: boolean; plural: boolean; hit?: Hit } {
  let best = 0;
  let strong = false;
  let plural = false;
  let hit: Hit | undefined;
  fields.forEach((ws, field) =>
    ws.forEach((w, index) => {
      const k = wordKind(term, w);
      const s = k >= 2 ? 1 : k === 1 ? 0.95 : fuzzy ? similarity(term, w) : 0;
      if (s > best || (s === best && k === 2 && !strong)) {
        best = s;
        strong = k === 2;
        plural = k === 3;
        hit = { field, index };
      }
    }),
  );
  return { score: best, strong, plural, hit };
}

/**
 * Scores a row against the terms. `all` is true when every term matched (fuzzy mode allows sensible typos).
 * `sure` is true only when every word matched as the same word: false when a match leans on a shortened bank word,
 * a bare initial ("OMAR M" for "Omar Mousselli") or a typo, so the caller must confirm before stating it as fact.
 */
export function scoreRow(terms: string[], row: SearchRow, fuzzy = false): { score: number; all: boolean; sure: boolean } {
  if (!terms.length) return { score: 1, all: true, sure: true };
  const fields = [words(row.description), words(row.merchantName), words(row.notes)];
  const results = terms.map((t) => matchTerm(t, fields, fuzzy));
  const ok = results.map((r) => r.score > FUZZY_THRESHOLD);
  const viaInitial = new Set<number>();
  if (terms.length >= 2) {
    results.forEach((r, i) => {
      if (ok[i]) return;
      for (let j = 0; j < results.length; j++) {
        const h = results[j].hit;
        if (j === i || !ok[j] || !h) continue;
        const ws = fields[h.field];
        if (ws[h.index - 1] === terms[i][0] || ws[h.index + 1] === terms[i][0]) {
          ok[i] = true;
          viaInitial.add(i);
          r.score = Math.max(r.score, 0.9);
          return;
        }
      }
    });
  }
  const all = ok.every(Boolean);
  const p2p = fields.flat().some((w) => APPS.has(w));
  return {
    score: results.reduce((s, r) => s + r.score, 0) / results.length,
    all,
    sure: all && !fuzzy && results.every((r, i) => (r.strong || (r.plural && !p2p)) && !viaInitial.has(i)),
  };
}

export function rowMatches(terms: string[], row: SearchRow): boolean {
  return scoreRow(terms, row, false).all;
}

/** Text any matching row must contain: the first 4 letters of a word (the whole word when shorter). Compared accent-folded in SQL. */
export function prefilterNeedles(terms: string[]): string[] {
  return [...new Set(terms.map((t) => t.slice(0, 4)))];
}

/** ILIKE needles for person-to-person payment apps. */
export const P2P_NEEDLES = ["zelle", "venmo", "cash app", "cashapp", "paypal", "p2p"];
