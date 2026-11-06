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
  /**
   * The account it's in, that account's type and last 4 digits. They tell a transfer between the
   * user's own accounts (savings, card payments) from money sent to someone else (a loan, a roommate).
   */
  accountId?: string | null;
  accountType?: string | null;
  accountMask?: string | null;
};

export type RecurringKind = "subscription" | "bill" | "income";

export type RecurringCandidate = {
  merchantKey: string;
  /**
   * One per series: the merchant key, or `<merchant key>~2`, `~3` for the later ones when one merchant
   * bills several (iCloud and Apple Music both read "APPLE.COM/BILL").
   */
  seriesKey: string;
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
  /** The day of the month a monthly (or longer) schedule keeps: 31 for one on the last day (Jan 31, Feb 28, Mar 31). */
  dueDay: number;
  /** The latest change of price, dated on the first charge at the new price. Signed like the amounts. */
  priceChange: { fromCents: number; toCents: number; date: string } | null;
  /** The series' charges, one per cycle. */
  charges: { date: string; amountCents: number }[];
  /** A second charge of the same amount within 2 days of one of the series' charges, when the series doesn't usually bill twice. */
  duplicates: { dates: [string, string]; amountCents: number; label: string }[];
  confidence: number;
};

/** The confidence a found series needs before it's offered as a bill or subscription, counted in totals or given to the assistant. */
export const MIN_CONFIDENCE = 0.6;

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

/** A readable merchant name: Plaid's when it has one, else the cleaned description ("PAYPAL *HULU 402-935-7733" → "Hulu"). */
export function merchantDisplayName(t: Pick<DetectTxn, "merchantName" | "description">): string {
  const name = t.merchantName?.trim();
  if (name) return name;
  const key = merchantKey(t);
  return key ? key.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : t.description;
}

/** The key format used before Oct 31, 2026, still stored in older category rules and tracked bills. */
export function legacyMerchantKey(t: Pick<DetectTxn, "merchantName" | "description">): string {
  return normalizeText(t.merchantName || t.description)
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every key a stored rule or bill might use for this transaction (current first). */
export function merchantKeys(t: Pick<DetectTxn, "merchantName" | "description">): string[] {
  return [...new Set([merchantKey(t), legacyMerchantKey(t)].filter(Boolean))];
}

/** Services people subscribe to; two matching charges a month apart are enough to call these a subscription. */
const KNOWN_SUBSCRIPTION =
  /netflix|spotify|hulu|disney|max\b|hbo|paramount|peacock|youtube|apple|icloud|prime|audible|kindle|crunchyroll|chatgpt|openai|claude|anthropic|midjourney|notion|canva|adobe|microsoft|office|dropbox|google one|duolingo|headspace|calm|planet fitness|la fitness|gym|fitness|peloton|xbox|playstation|nintendo|twitch|patreon|onlyfans|discord|dashpass|doordash|uber one|grubhub|instacart|walmart\+|chegg|quizlet|grammarly|course hero|linkedin|tinder|bumble|hinge|vpn|1password|siriusxm|pandora|tidal|starz|showtime|amc\+|espn|fubo|sling|nyt|new york times|wsj|substack|medium/i;
const BILL_CATEGORY = /rent|mortgage|utilit|electric|water|gas bill|internet|phone|insurance|loan|tuition|car payment|childcare/i;
const SUBSCRIPTION_CATEGORY = /subscri|streaming|software|entertainment|fitness|gym/i;
/** Day-to-day spending (food and drink, groceries, fuel): never a bill, and a subscription only at a fixed price on a steady schedule (a meal kit, a coffee club). */
const EVERYDAY_CATEGORY = new Set([
  "food & dining",
  "food and drink",
  "groceries",
  "grocery",
  "restaurants",
  "restaurant",
  "dining",
  "fast food",
  "coffee",
  "coffee shops",
  "food delivery",
  "bars",
  "alcohol & bars",
  "gas",
  "fuel",
  "gas & fuel",
]);
const isEveryday = (category: string | null | undefined) => !!category && EVERYDAY_CATEGORY.has(category.trim().toLowerCase());

// ------------------------------------------------------------ transfers

/** Transfer categories that only move the user's own money (Plaid's TRANSFER_OUT_SAVINGS and credit card payments). */
const OWN_MONEY_CATEGORY = new Set(["Savings Transfer", "Credit Card Payment"]);
/** Statement lines that move money between the user's own accounts, pay their own card, or take out cash. */
const OWN_MONEY_TEXT = new RegExp(
  [
    String.raw`\b(?:to|from)\s+(?:my\s+)?(?:sav|savings?|chk|chkg|checking|share savings|share draft|money market|mmkt|mma|brokerage)\b`,
    String.raw`\b(?:transfer|xfer|trnsfr|tfr)\b.*\b(?:sav|savings?|chk|chkg|checking)\b`,
    String.raw`\b(?:credit card|card|crd|visa|mastercard|amex|discover)\b.*\b(?:payment|pmt|pymt|epay|autopay|auto pay)\b`,
    String.raw`\bpayment (?:thank you|received)\b`,
    String.raw`\b(?:atm|withdrawal|withdrwl|wdl|cash advance)\b`,
  ].join("|"),
  "i",
);
/** A payment app moving the user's own money: topping up the balance or cashing it out. */
const APP_OWN_MONEY =
  /\b(?:add(?:ed)? (?:funds|money|cash)|cash ?out|inst(?:ant)? (?:xfer|transfer)|standard transfer|top ?up|transfer to bank|to (?:my )?bank)\b/i;
/** Lenders and loan words: a payment on a debt is a bill, even when the loan's account is linked too. */
const LENDER = new RegExp(
  String.raw`\b(?:loan|ln|mortgage|mtg|lease|heloc|student|auto (?:loan|finance|financing)|car (?:loan|payment|pmt)|navient|nelnet|mohela|aidvantage|sallie mae|great lakes|edfinancial|fedloan|dept (?:of )?ed(?:ucation)?|` +
    String.raw`toyota (?:financial|motor credit|fin)|(?:american )?honda (?:financial|finance|fin)|ford (?:motor )?credit|gm financial|nissan (?:motor acceptance|finance)|hyundai (?:capital|motor finance)|` +
    String.raw`kia (?:motors )?finance|santander consumer|carmax auto|westlake|credit acceptance|ally auto|tesla finance|bmw financial|mercedes-benz financial|vw credit|chrysler capital|exeter finance|` +
    String.raw`upstart|lending ?club|prosper|best egg|avant|oportun|onemain|lightstream|affirm|klarna|afterpay|sezzle|rocket mortgage|mr cooper|loancare|freedom mortgage|pennymac|shellpoint|newrez|nationstar)\b`,
  "i",
);
/** Rent paid by transfer. */
const RENT_TRANSFER = /\b(?:rent|apts?|apartments?|property management|prop mgmt|landlord|leasing office)\b/i;
/** College savings and tuition plans (a 529). */
const COLLEGE_PLAN = /\b(?:529|tuition|college sav\w*|nest ?529|my ?529|scholarshare|edvest|collegeinvest|collegeadvantage|bright start)\b/i;
/** Banks, brokerages and card issuers people move their own money to (savings, investing, paying a card). */
const OWN_MONEY_PLACE = new RegExp(
  String.raw`\b(?:ally|marcus|goldman sachs|gs ?bank|sofi|capital one|citi|citibank|citicard|chase|discover|amex|american express|barclaycard|barclays|synchrony|apple ?card|applecard|` +
    String.raw`wells fargo|bank of america|us bank|credit one|mission lane|bilt|cit bank|wealthfront|betterment|robinhood|acorns|stash|vanguard|fidelity|schwab|e ?trade|ameritrade|merrill|webull|` +
    String.raw`m1 finance|coinbase|kraken|gemini|chime|varo|digit|qapital|treasurydirect|treasury direct)\b`,
  "i",
);
/** Payment apps and money transfer services: money sent through them to a person (a roommate, family) is a bill paid to that person. */
const PAYMENT_APP = /\b(?:zelle|venmo|cash ?app|square cash|paypal|apple cash|remitly|wise|western union|moneygram|xoom|worldremit)\b/i;
/** Another account's last 4 digits as statements print them ("TO SAV XXXXXX4410", "ACCT ...4410"). */
const ACCOUNT_DIGITS = /(?:x{2,}|\*+|\.{3}|acct|account|ending in|ending)\s*#?\s*(\d{4})\b/gi;

/** Overdraft, NSF, ATM, late, foreign transaction and monthly service fees: never a bill or a subscription. */
const FEE =
  /\b(overdraft|od fee|nsf|insufficient funds|returned item|atm (?:fee|surcharge|withdrawal fee)|non-?network atm|late (?:fee|charge|payment fee)|foreign (?:transaction|exchange) fee|intl? (?:transaction )?fee|monthly (?:service|maintenance) fee|maintenance fee|service charge|paper statement fee)\b/i;
export function isBankFee(t: Pick<DetectTxn, "description" | "merchantName">) {
  return FEE.test(`${t.description} ${t.merchantName ?? ""}`);
}

const lineOf = (t: Pick<DetectTxn, "merchantName" | "description">) => `${t.merchantName ?? ""} ${t.description}`;

/**
 * Whether an outgoing transfer pays someone else, and so can be a bill. Only with evidence: a lender or
 * loan, rent, a 529 or tuition plan, or a payment app sending money to a person (Zelle to a roommate,
 * Venmo for the utilities). Everything else is the user's own money moving (savings at Ally or Marcus,
 * investing at Vanguard, paying the Citi card, topping up Venmo): the same amount landing in another of
 * their accounts within 4 days, a savings or card-payment category, a line or an institution that says so.
 */
function makePaysSomeoneElse(txns: DetectTxn[]) {
  const incoming = new Map<number, DetectTxn[]>();
  for (const t of txns)
    if (!t.pending && t.amountCents > 0 && t.accountId) {
      const list = incoming.get(t.amountCents);
      if (list) list.push(t);
      else incoming.set(t.amountCents, [t]);
    }
  // The user's own accounts by last 4 digits (a loan's account is someone else's money to pay).
  const ownDigits = new Set(txns.filter((t) => t.accountMask && t.accountType !== "loan").map((t) => t.accountMask!));
  return (t: DetectTxn) => {
    const line = lineOf(t);
    const otherHalf = t.accountId
      ? incoming
          .get(-t.amountCents)
          ?.find(
            (u) =>
              u.accountId !== t.accountId &&
              Math.abs(daysBetween(t.date, u.date)) <= 4 &&
              (u.kind === "transfer" || u.accountType === "credit" || u.accountType === "loan"),
          )
      : undefined;
    if (otherHalf) return otherHalf.accountType === "loan";
    if (t.categoryName && OWN_MONEY_CATEGORY.has(t.categoryName)) return false;
    if (OWN_MONEY_TEXT.test(line) || APP_OWN_MONEY.test(line)) return false;
    if (LENDER.test(line) || RENT_TRANSFER.test(line) || COLLEGE_PLAN.test(line)) return true;
    for (const m of line.matchAll(ACCOUNT_DIGITS)) if (m[1] !== t.accountMask && ownDigits.has(m[1])) return false;
    if (OWN_MONEY_PLACE.test(line)) return false;
    return PAYMENT_APP.test(line);
  };
}

// ------------------------------------------------------------ schedules

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayOf = (date: string) => Number(date.slice(8, 10));
const lastDayOfMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();

/**
 * The n-th date of a schedule that starts on `start` (n = 0 is `start`). Monthly and longer ones keep the
 * day of the month, `day` or the start's own: from Jan 31 that's Feb 28, Mar 31, Apr 30, never the 28th
 * for good after February.
 */
export function nthOccurrence(start: string, freq: Frequency, n: number, day = dayOf(start)): string {
  if (freq === "weekly" || freq === "biweekly") return addDaysStr(start, n * (freq === "weekly" ? 7 : 14));
  const months = n * (freq === "monthly" ? 1 : freq === "quarterly" ? 3 : 12);
  const target = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** Advances a due date by one period. To project further, use `nthOccurrence` or `occurrencesBetween` from the first date. */
export function nextOccurrence(date: string, freq: Frequency): string {
  return nthOccurrence(date, freq, 1);
}

/** The dates of a schedule from `start` that fall between `from` and `to` (both included), at most `limit`. */
export function occurrencesBetween(start: string, freq: Frequency, from: string, to: string, opts: { day?: number; limit?: number } = {}): string[] {
  const day = opts.day ?? dayOf(start);
  const days = PERIODS.find((p) => p.freq === freq)!.days;
  // Jump close to `from` instead of stepping through a long-stale start one period at a time.
  let n = Math.max(0, Math.floor(daysBetween(start, from) / days) - 1);
  while (nthOccurrence(start, freq, n, day) < from) n++;
  const out: string[] = [];
  for (let d = nthOccurrence(start, freq, n, day); d <= to && out.length < (opts.limit ?? 60); d = nthOccurrence(start, freq, ++n, day)) out.push(d);
  return out;
}

/** The day a monthly (or longer) series keeps: its last charge's, unless that's a short month's last day standing in for the 29th to 31st. */
function dueDayOf(dates: string[]): number {
  const last = dates[dates.length - 1];
  if (dayOf(last) !== lastDayOfMonth(last)) return dayOf(last);
  return Math.max(...dates.map(dayOf).filter((d) => d >= dayOf(last)));
}

// ------------------------------------------------------------ detection

function kindOf(name: string, category: string | null | undefined, amounts: number[], variable: boolean, transfer: boolean, everyday: boolean): RecurringKind {
  if (amounts[amounts.length - 1] > 0) return "income";
  // Money sent to a lender or a person on a schedule: a car loan, rent or a bill share by Zelle, a 529.
  if (transfer) return "bill";
  if (everyday) return "subscription";
  if (category && BILL_CATEGORY.test(category)) return "bill";
  if (KNOWN_SUBSCRIPTION.test(name) || (category && SUBSCRIPTION_CATEGORY.test(category))) return "subscription";
  return variable || -amounts[amounts.length - 1] > 10_000 ? "bill" : "subscription";
}

/** One charge per cycle, with the extra copies that landed beside it. */
type Cycle = { t: DetectTxn; extra: DetectTxn[] };
/** How far apart two charges of the same amount can be and still be one charge billed twice. */
const DUPLICATE_DAYS = 2;

/**
 * Charges of the same amount on the same day are one charge billed twice. Within 2 days too, unless the
 * merchant often bills that way (a class on Mondays and Wednesdays): then they stay separate charges.
 */
function cyclesOf(sorted: DetectTxn[]): Cycle[] {
  const cycles: Cycle[] = [];
  for (const t of sorted) {
    // Sorted by date, so a same-day copy is among the last few.
    let same: Cycle | undefined;
    for (let j = cycles.length - 1; j >= 0 && cycles[j].t.date === t.date && !same; j--) if (cycles[j].t.amountCents === t.amountCents) same = cycles[j];
    if (same) same.extra.push(t);
    else cycles.push({ t, extra: [] });
  }
  // The earlier charge of the same amount at most 2 days before, if any.
  const firstOf = (i: number) => {
    for (let j = i - 1; j >= 0 && daysBetween(cycles[j].t.date, cycles[i].t.date) <= DUPLICATE_DAYS; j--)
      if (cycles[j].t.amountCents === cycles[i].t.amountCents) return j;
    return -1;
  };
  const near = new Map<number, number>();
  cycles.forEach((_, i) => {
    const j = firstOf(i);
    if (j >= 0) near.set(i, j);
  });
  if (!near.size || near.size > Math.max(1, Math.floor(cycles.length / 3))) return cycles;
  // Fold each into the charge it repeats (following a chain of repeats back to the first).
  const home = (i: number): number => (near.has(i) ? home(near.get(i)!) : i);
  for (const [i] of near) cycles[home(i)].extra.push(cycles[i].t, ...cycles[i].extra);
  return cycles.filter((_, i) => !near.has(i));
}

/** `strict`: a price picked out of a merchant that also bills other things (Apple, Amazon) needs 3 charges, never 2. */
type Context = { key: string; strict?: boolean };
/** A series before it's given its series key. */
type Found = Omit<RecurringCandidate, "seriesKey"> & { cycles: Cycle[] };

const onSchedule = (gap: number, p: (typeof PERIODS)[number]) => Math.abs(gap - p.days) <= p.tolerance * 1.5;
/** A price change people actually see: at most double, at least half. */
const plausibleChange = (from: number, to: number) => to / from <= 2 && to / from >= 0.5;

/** Runs of charges at one exact price, in date order. */
function runsOf(cycles: Cycle[]) {
  const runs: Cycle[][] = [];
  for (const c of cycles) {
    const run = runs[runs.length - 1];
    if (run && run[0].t.amountCents === c.t.amountCents) run.push(c);
    else runs.push([c]);
  }
  return runs;
}

/** Scores charges as one series: a steady interval, a steady amount (or a few clean price changes), and enough of them. */
function evaluate(cycles: Cycle[], { key, strict }: Context): Found | null {
  if (cycles.length < 2) return null;
  const ts = cycles.map((c) => c.t);
  const last = ts[ts.length - 1];
  const name = merchantDisplayName(last);
  const category = last.categoryName ?? ts.find((t) => t.categoryName)?.categoryName;
  const gaps = ts.slice(1).map((t, i) => daysBetween(ts[i].date, t.date));
  const period = PERIODS.find((p) => Math.abs(median(gaps) - p.days) <= p.tolerance);
  if (!period) return null;
  const amounts = ts.map((t) => t.amountCents);
  const med = median(amounts);
  const near = (a: number, pct: number) => Math.abs(a - med) <= Math.max(Math.abs(med) * pct, 100);
  const transfer = ts.some((t) => t.kind === "transfer");
  // Bills keep their schedule even when the amount moves, and so does a share of one paid to a person (utilities by Venmo).
  const billLike = (!!category && BILL_CATEGORY.test(category)) || transfer;
  const everyday = isEveryday(category);
  const exact = amounts.every((a) => a === amounts[0]);
  const known = KNOWN_SUBSCRIPTION.test(name) || KNOWN_SUBSCRIPTION.test(key);
  // A loan payment or a 529 contribution is planned; two equal ones a month apart are enough, like a known subscription.
  const scheduled = transfer && ts.some((t) => LENDER.test(lineOf(t)) || COLLEGE_PLAN.test(lineOf(t)));
  // A price picked out of other purchases (strict) needs more: 3 monthly or yearly charges, 4 quarterly ones.
  const minCount = strict
    ? period.freq === "quarterly"
      ? 4
      : 3
    : period.freq === "yearly" || ((known || scheduled) && exact && period.freq === "monthly")
      ? 2
      : 3;
  if (ts.length < minCount) return null;
  const regular = gaps.filter((g) => onSchedule(g, period)).length / gaps.length;
  if (everyday && !(exact && regular === 1)) return null;
  // A price picked out of other purchases has to bill like a subscription: monthly or longer, every time on schedule.
  // So does money sent to a person through an app (rent or a share by Zelle or Venmo), or friends' payments look like a bill.
  const toPerson = transfer && ts.every((t) => PAYMENT_APP.test(lineOf(t)));
  if ((strict || toPerson) && (regular < 1 || period.freq === "weekly" || period.freq === "biweekly")) return null;
  // A price that holds between a few clean changes (Netflix at $15.49 twice, then $17.99) is a steady amount, not a wobbling one.
  const runs = runsOf(cycles);
  const runStart = (i: number) => daysBetween(runs[i - 1][runs[i - 1].length - 1].t.date, runs[i][0].t.date);
  const steps =
    !billLike &&
    runs.length >= 2 &&
    runs.length <= 3 &&
    new Set(runs.map((r) => r[0].t.amountCents)).size === runs.length &&
    runs.some((r) => r.length >= 2) &&
    runs.slice(1).every((r, i) => plausibleChange(runs[i][0].t.amountCents, r[0].t.amountCents) && onSchedule(runStart(i + 1), period));
  // Something other than a bill whose amount moves (a class paid per visit) needs 4 charges before it's a series.
  if (!billLike && !steps && ts.length < 4 && !amounts.every((a) => near(a, 0.05))) return null;
  // Bills keep their schedule even when the amount moves; everything else has to hold its price (±15%).
  const amountStable = steps ? 1 : amounts.filter((a) => near(a, billLike ? 0.6 : 0.15)).length / amounts.length;
  const evidence = minCount === 2 && ts.length === 2 ? 0.8 : Math.min(1, ts.length / 4);
  const confidence = Math.round(regular * amountStable * evidence * 100) / 100;
  if (confidence < 0.5) return null;
  const variable = !amounts.every((a) => near(a, 0.05));
  // The latest change of price, once the old price held at least twice and the new one came on schedule. For a bill
  // (its amount may move) only when it had one fixed price until then (internet at $55, then $57).
  const [prev, cur] = runs.length >= 2 ? [runs[runs.length - 2], runs[runs.length - 1]] : [];
  const priceChange =
    (!billLike || runs.length === 2) &&
    prev &&
    cur &&
    prev.length >= 2 &&
    plausibleChange(prev[0].t.amountCents, cur[0].t.amountCents) &&
    onSchedule(runStart(runs.length - 1), period)
      ? { fromCents: prev[0].t.amountCents, toCents: cur[0].t.amountCents, date: cur[0].t.date }
      : null;
  const dueDay = period.freq === "weekly" || period.freq === "biweekly" ? dayOf(last.date) : dueDayOf(ts.map((t) => t.date));
  return {
    merchantKey: key,
    name,
    kind: kindOf(name, category, amounts, variable, transfer, everyday),
    frequency: period.freq,
    averageAmountCents: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
    latestAmountCents: last.amountCents,
    variableAmount: variable,
    occurrences: ts.length,
    lastDate: last.date,
    nextExpectedDate: nthOccurrence(last.date, period.freq, 1, dueDay),
    dueDay,
    priceChange,
    charges: ts.map((t) => ({ date: t.date, amountCents: t.amountCents })),
    duplicates: duplicatesOf(cycles),
    confidence,
    cycles,
  };
}

/** Cycles billed more often than this series usually is: a second charge of the same amount within 2 days. */
function duplicatesOf(cycles: Cycle[]): RecurringCandidate["duplicates"] {
  const usual = median(cycles.map((c) => 1 + c.extra.length));
  return cycles
    .filter((c) => 1 + c.extra.length > usual)
    .flatMap((c) =>
      c.extra.map((x) => ({ dates: [c.t.date, x.date] as [string, string], amountCents: x.amountCents, label: x.merchantName || x.description })),
    );
}

/**
 * Two charges a month apart on two different days (the 3rd and the 20th) look like one charge every two
 * weeks, or like no schedule at all. When each day of the month holds its own monthly series, they're two.
 */
function byDay(cycles: Cycle[], ctx: Context): Found[] {
  const slots: Cycle[][] = [];
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 31 - Math.abs(a - b));
  for (const c of cycles) {
    const slot = slots.find((s) => apart(dayOf(s[0].t.date), dayOf(c.t.date)) <= 3);
    if (slot) slot.push(c);
    else slots.push([c]);
  }
  if (slots.length < 2) return [];
  // Each day is picked out of the rest, so it needs 3 charges, all on schedule.
  const monthly = slots.map((s) => evaluate(s, { ...ctx, strict: true })).filter((f): f is Found => f?.frequency === "monthly");
  const covered = monthly.reduce((n, f) => n + f.cycles.length, 0);
  return monthly.length >= 2 && covered >= cycles.length - 1 ? monthly : [];
}

/**
 * A strict series with its strays left out: a same-price charge off the schedule (an App Store purchase
 * at iCloud's $2.99) shouldn't break iCloud. At most 1 stray in 6 charges, and never a gap left open.
 */
function withoutStrays(cycles: Cycle[]): Cycle[] | null {
  const p = PERIODS.find((x) => Math.abs(median(cycles.slice(1).map((c, i) => daysBetween(cycles[i].t.date, c.t.date))) - x.days) <= x.tolerance * 2);
  if (!p) return null;
  let best: Cycle[] | null = null;
  for (const start of [0, 1]) {
    const kept = [cycles[start]];
    for (const c of cycles.slice(start + 1)) if (daysBetween(kept[kept.length - 1].t.date, c.t.date) >= p.days - p.tolerance * 1.5) kept.push(c);
    const strays = cycles.length - kept.length;
    const onTime = kept.every((c, i) => i === 0 || onSchedule(daysBetween(kept[i - 1].t.date, c.t.date), p));
    if (onTime && strays >= 1 && strays <= Math.max(1, Math.floor(kept.length / 6)) && (!best || kept.length > best.length)) best = kept;
  }
  return best;
}

/** The series in a set of charges: one, or (money going out) one per day of the month when that fits better. */
function seriesIn(cycles: Cycle[], ctx: Context): Found[] {
  const kept = ctx.strict && !evaluate(cycles, ctx) ? withoutStrays(cycles) : null;
  const f = evaluate(kept ?? cycles, ctx);
  if (f && f.frequency !== "weekly" && f.frequency !== "biweekly") return [f];
  // A real weekly or biweekly charge keeps its interval to the day or so.
  const p = PERIODS.find((x) => x.freq === f?.frequency);
  if (f && p && f.cycles.every((c, i) => i === 0 || Math.abs(daysBetween(f.cycles[i - 1].t.date, c.t.date) - p.days) <= p.tolerance)) return [f];
  const days = cycles[0].t.amountCents < 0 ? byDay(cycles, ctx) : [];
  return days.length ? days : f ? [f] : [];
}

/**
 * The series in one merchant's charges (one direction). Usually one; but Apple, Google and Amazon bill
 * several services under one name, so charges are also split by price: each exact price that keeps its
 * own schedule is a series, and a new price that picks up on that schedule continues it (a price change).
 * A one-off purchase from the same merchant joins none.
 */
function seriesOf(cycles: Cycle[], ctx: Context): Found[] {
  if (cycles.length < 2) return [];
  // Only money going out is split by price, and a café or grocery store only when it sells a subscription (DashPass).
  const last = cycles[cycles.length - 1].t;
  const category = last.categoryName ?? cycles.find((c) => c.t.categoryName)?.t.categoryName;
  const splittable = last.amountCents < 0 && (!isEveryday(category) || KNOWN_SUBSCRIPTION.test(ctx.key));
  if (!splittable) return seriesIn(cycles, ctx);
  // Runs of one exact price, oldest first. A later price that starts one period after another stops continues it;
  // a price seen only once does that only on time and right after a price that held at least twice.
  const byPrice = [...Map.groupBy(cycles, (c) => c.t.amountCents).values()].sort((a, b) => a[0].t.date.localeCompare(b[0].t.date));
  const chains: Cycle[][] = [];
  for (const group of byPrice) {
    const start = group[0].t;
    const continues = chains.find((ch) => {
      const end = ch[ch.length - 1].t;
      if (end.date >= start.date || !plausibleChange(end.amountCents, start.amountCents)) return false;
      const runs = runsOf(ch);
      if (group.length < 2 && runs[runs.length - 1].length < 2) return false;
      const p = PERIODS.find((x) => Math.abs(median(ch.slice(1).map((c, i) => daysBetween(ch[i].t.date, c.t.date))) - x.days) <= x.tolerance);
      return !!p && Math.abs(daysBetween(end.date, start.date) - p.days) <= p.tolerance * (group.length >= 2 ? 1.5 : 1);
    });
    if (continues) continues.push(...group);
    else if (group.length >= 2) chains.push([...group]);
  }
  const own = chains.flatMap((ch) => seriesIn(ch, { ...ctx, strict: ch.length < cycles.length }));
  // A share of a bill paid to a person through an app moves each month (utilities by Venmo) among other payments
  // to friends: charges of a similar size (within 1.5x of each other, $15 or more) that keep their own schedule.
  if (cycles.every((c) => c.t.kind === "transfer" && PAYMENT_APP.test(lineOf(c.t)))) {
    const used = new Set(own.flatMap((f) => f.cycles));
    // Smallest to largest payment (amounts going out are negative).
    const rest = cycles.filter((c) => !used.has(c)).sort((a, b) => b.t.amountCents - a.t.amountCents);
    const bands: Cycle[][] = [];
    for (const c of rest) {
      const band = bands[bands.length - 1];
      if (band && c.t.amountCents / band[band.length - 1].t.amountCents <= 1.5) band.push(c);
      else bands.push([c]);
    }
    // A band that keeps no schedule may be two sizes run together (friends' $25 dinners next to a $38 share):
    // split it where the sizes are furthest apart and try each part.
    const tryBand = (band: Cycle[], depth: number): Found[] => {
      if (band.length < 3) return [];
      const found =
        band.length < cycles.length && -median(band.map((c) => c.t.amountCents)) >= 1_500
          ? seriesIn(
              [...band].sort((a, b) => a.t.date.localeCompare(b.t.date)),
              { ...ctx, strict: true },
            )
          : [];
      if (found.length || depth >= 3 || band.length < 6) return found;
      let at = 1;
      for (let i = 2; i < band.length; i++) if (band[i].t.amountCents / band[i - 1].t.amountCents > band[at].t.amountCents / band[at - 1].t.amountCents) at = i;
      return [...tryBand(band.slice(0, at), depth + 1), ...tryBand(band.slice(at), depth + 1)];
    };
    for (const band of bands) own.push(...tryBand(band, 0));
  }
  // A price that stopped before the newest one started is an old price, not a second service.
  const newestStart = own.reduce((s, f) => (f.charges[0].date > s ? f.charges[0].date : s), "");
  const current = own.filter((f) => f.lastDate >= newestStart);
  if (current.length >= 2) return current;
  // Otherwise all of the merchant's charges together (a bill whose amount moves, a price change), or the one price that holds.
  const whole = seriesIn(cycles, ctx);
  const best = current[0];
  if (whole.length >= 2 || (whole[0] && (!best || whole[0].confidence >= best.confidence))) return whole;
  return best ? [best] : [];
}

/**
 * Finds series of charges (or deposits) from the same merchant at a regular interval.
 * - A pending charge counts only when no posted copy sits beside it; a second charge of the same amount
 *   within 2 days is one charge billed twice (reported in `duplicates`), unless the merchant often bills that way.
 * - A series that missed its last expected charge has stopped and isn't returned (`today`, by default the
 *   newest transaction's date).
 * - 3+ charges (2 for yearly) at a steady interval and amount; bills (rent, utilities, phone, insurance)
 *   may vary in amount, and a price change on schedule keeps the series.
 * - Known subscription services, loan payments and planned contributions count after 2 identical charges
 *   a month apart, so a new one shows up the second time it bills, not the third.
 * - One merchant billing several services (iCloud and Apple Music) gives one series each.
 * - Money sent by transfer to someone else (a car loan, rent by Zelle, a 529) is a bill; moving money
 *   between the user's own accounts (savings, card payments, checking to checking) never is.
 * - Everyday spending that merely repeats (coffee, groceries, rides) never qualifies: its amounts and
 *   intervals wander, and food, drink and fuel need a fixed price on a steady schedule.
 */
export function detectRecurring(txns: DetectTxn[], opts: { today?: string } = {}): RecurringCandidate[] {
  const today = opts.today ?? txns.reduce((m, t) => (t.date > m ? t.date : m), "");
  const paysSomeoneElse = makePaysSomeoneElse(txns);
  // A pending charge counts when no posted copy of it sits within a week (this month's charge, not yet posted).
  const posted = Map.groupBy(
    txns.filter((t) => !t.pending),
    (t) => merchantKey(t),
  );
  const hasPostedCopy = (t: DetectTxn) =>
    (posted.get(merchantKey(t)) ?? []).some(
      (u) =>
        Math.sign(u.amountCents) === Math.sign(t.amountCents) &&
        Math.abs(u.amountCents - t.amountCents) <= Math.max(Math.abs(t.amountCents) * 0.2, 100) &&
        Math.abs(daysBetween(u.date, t.date)) <= 7,
    );
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.kind === "adjustment" || (t.pending && hasPostedCopy(t))) continue;
    if (t.kind === "transfer" && !(t.amountCents < 0 && paysSomeoneElse(t))) continue;
    if (t.amountCents < 0 && (isBankFee(t) || t.categoryName === "Fees & Interest")) continue;
    const key = merchantKey(t);
    if (!key) continue;
    const k = `${key}|${t.amountCents < 0 ? "out" : "in"}`;
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }
  const out: RecurringCandidate[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const key = k.split("|")[0];
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // A series that missed its last expected charge (by a week, or a quarter of its period) has stopped.
    const found = seriesOf(cyclesOf(sorted), { key })
      .filter((f) => daysBetween(f.nextExpectedDate, today) <= Math.max(7, PERIODS.find((p) => p.freq === f.frequency)!.days * 0.25))
      .sort((a, b) => a.charges[0].date.localeCompare(b.charges[0].date));
    found.forEach(({ cycles: _cycles, ...series }, i) => out.push({ ...series, seriesKey: i === 0 ? key : `${key}~${i + 1}` }));
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
