import type { Frequency } from "../../db/schema";
import { normalizeText } from "@/lib/utils";
import { addDaysStr, daysBetween } from "@/lib/dates";

export type DetectTxn = {
  date: string;
  amountCents: number;
  merchantName: string | null;
  description: string;
  kind: string;
  categoryName?: string | null;
  pending?: boolean;
};

export type RecurringKind = "subscription" | "bill" | "income";

export type RecurringCandidate = {
  merchantKey: string;
  name: string;
  kind: RecurringKind;
  frequency: Frequency;
  averageAmountCents: number;
  /** The most recent charge (what the next one will most likely be). */
  latestAmountCents: number;
  /** The amount changes from charge to charge (electric, phone overage). */
  variableAmount: boolean;
  occurrences: number;
  lastDate: string;
  nextExpectedDate: string;
  confidence: number;
};

const PERIODS: { freq: Frequency; days: number; tolerance: number }[] = [
  { freq: "weekly", days: 7, tolerance: 1 },
  { freq: "biweekly", days: 14, tolerance: 2 },
  { freq: "monthly", days: 30.4, tolerance: 4 },
  { freq: "quarterly", days: 91, tolerance: 7 },
  { freq: "yearly", days: 365, tolerance: 10 },
];

/** Payment processors that put their name in front of the real merchant ("PAYPAL *HULU", "SQ *CAFE"). */
const PROCESSOR = /^(?:paypal|pp|sq|tst|sp|py|ckc|dd|google|goog|apl|in)\s*\*\s*/i;
/** Words banks add that don't identify the merchant. */
const NOISE = new Set(
  "usa us inc llc co corp com net org www online pmt pymt payment payments autopay auto pay bill billing ach ppd id web debit purchase pos recurring subscr subscription club fees fee help".split(
    " ",
  ),
);

/**
 * A stable key for "the same merchant" across messy statement lines:
 * "NETFLIX.COM 866-579-7172 CA" → "netflix", "Spotify P2AB9C4D1" → "spotify",
 * "PAYPAL *HULU 402-935-7733" → "hulu", "RENT PAYMENT CAMPUS EDGE APTS ACH 8KQ2M1Z4" → "rent campus edge apts".
 * Plaid's merchant name wins when it's there.
 */
export function merchantKey(t: Pick<DetectTxn, "merchantName" | "description">): string {
  const raw = (t.merchantName?.trim() || t.description).replace(PROCESSOR, "");
  const words = normalizeText(
    raw
      .replace(/\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g, " ") // phone numbers
      .replace(/#\s*\d+/g, " ") // store numbers
      .replace(/\s[A-Z]{2}$/, " "), // trailing state code
  )
    .split(" ")
    .filter((w) => w && !NOISE.has(w) && !/\d/.test(w)); // reference codes and ids always contain digits
  return words.slice(0, 4).join(" ");
}

/** Services people subscribe to; two matching charges a month apart are enough to call these a subscription. */
const KNOWN_SUBSCRIPTION =
  /netflix|spotify|hulu|disney|max\b|hbo|paramount|peacock|youtube|apple|icloud|prime|audible|kindle|crunchyroll|chatgpt|openai|claude|anthropic|midjourney|notion|canva|adobe|microsoft|office|dropbox|google one|duolingo|headspace|calm|planet fitness|la fitness|gym|fitness|peloton|xbox|playstation|nintendo|twitch|patreon|onlyfans|discord|dashpass|doordash|uber one|grubhub|instacart|walmart\+|chegg|quizlet|grammarly|course hero|linkedin|tinder|bumble|hinge|vpn|1password|siriusxm|pandora|tidal|starz|showtime|amc\+|espn|fubo|sling|nyt|new york times|wsj|substack|medium/i;
const BILL_CATEGORY = /rent|mortgage|utilit|electric|water|gas bill|internet|phone|insurance|loan|tuition|car payment|childcare/i;
const SUBSCRIPTION_CATEGORY = /subscri|streaming|software|entertainment|fitness|gym/i;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function kindOf(name: string, category: string | null | undefined, amounts: number[], variable: boolean): RecurringKind {
  if (amounts[amounts.length - 1] > 0) return "income";
  if (category && BILL_CATEGORY.test(category)) return "bill";
  if (KNOWN_SUBSCRIPTION.test(name) || (category && SUBSCRIPTION_CATEGORY.test(category))) return "subscription";
  return variable || -amounts[amounts.length - 1] > 10_000 ? "bill" : "subscription";
}

/**
 * Finds series of charges (or deposits) from the same merchant at a regular interval.
 * - Pending copies and same-day duplicates are ignored.
 * - 3+ charges (2 for yearly) at a steady interval and amount; bills (rent, utilities,
 *   phone, insurance) may vary in amount.
 * - Known subscription services count after 2 identical charges a month apart, so a
 *   new one shows up the second time it bills, not the third.
 * - Everyday spending that merely repeats (coffee, groceries, rides) never qualifies:
 *   its amounts and intervals wander.
 */
export function detectRecurring(txns: DetectTxn[]): RecurringCandidate[] {
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.pending || t.kind === "transfer" || t.kind === "adjustment") continue;
    const key = merchantKey(t);
    if (!key) continue;
    const k = `${key}|${t.amountCents < 0 ? "out" : "in"}`;
    const list = groups.get(k) ?? [];
    if (!list.some((x) => x.date === t.date && x.amountCents === t.amountCents)) list.push(t);
    groups.set(k, list);
  }
  const out: RecurringCandidate[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const name = last.merchantName || last.description;
    const category = last.categoryName ?? sorted.find((t) => t.categoryName)?.categoryName;
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date));
    const period = PERIODS.find((p) => Math.abs(median(gaps) - p.days) <= p.tolerance);
    if (!period) continue;
    const amounts = sorted.map((t) => t.amountCents);
    const med = median(amounts);
    const near = (a: number, pct: number) => Math.abs(a - med) <= Math.max(Math.abs(med) * pct, 100);
    const billLike = !!category && BILL_CATEGORY.test(category);
    const exact = amounts.every((a) => a === amounts[0]);
    const known = KNOWN_SUBSCRIPTION.test(name) || KNOWN_SUBSCRIPTION.test(k);
    const minCount = period.freq === "yearly" || (known && exact && period.freq === "monthly") ? 2 : 3;
    if (sorted.length < minCount) continue;
    const regular = gaps.filter((g) => Math.abs(g - period.days) <= period.tolerance * 1.5).length / gaps.length;
    // Bills keep their schedule even when the amount moves; everything else has to hold its price (±15%).
    const amountStable = amounts.filter((a) => near(a, billLike ? 0.6 : 0.15)).length / amounts.length;
    const evidence = minCount === 2 && sorted.length === 2 ? 0.8 : Math.min(1, sorted.length / 4);
    const confidence = Math.round(regular * amountStable * evidence * 100) / 100;
    if (confidence < 0.5) continue;
    const variable = !amounts.every((a) => near(a, 0.05));
    out.push({
      merchantKey: k.split("|")[0],
      name,
      kind: kindOf(name, category, amounts, variable),
      frequency: period.freq,
      averageAmountCents: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
      latestAmountCents: last.amountCents,
      variableAmount: variable,
      occurrences: sorted.length,
      lastDate: last.date,
      nextExpectedDate: nextOccurrence(last.date, period.freq),
      confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Advances a due date by a frequency. */
export function nextOccurrence(date: string, freq: Frequency): string {
  const [y, m, d] = date.split("-").map(Number);
  const addMonths = (n: number) => {
    const target = new Date(Date.UTC(y, m - 1 + n, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  };
  switch (freq) {
    case "weekly":
      return addDaysStr(date, 7);
    case "biweekly":
      return addDaysStr(date, 14);
    case "monthly":
      return addMonths(1);
    case "quarterly":
      return addMonths(3);
    case "yearly":
      return addMonths(12);
  }
}
