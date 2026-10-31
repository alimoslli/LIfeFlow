import { addDaysStr } from "@/lib/dates";

/**
 * Six months of a working student's bank feed, written the way Plaid delivers it:
 * messy descriptions (phone numbers, reference codes, processor prefixes), merchant
 * names only sometimes, pending copies, and lots of everyday spending that repeats
 * without being a bill. `truth` is the answer key for the recurring-charge eval.
 */
export type FixtureTxn = {
  date: string;
  amountCents: number;
  merchantName: string | null;
  description: string;
  kind: "expense" | "income" | "transfer";
  categoryName: string | null;
  pending?: boolean;
};

export type Truth = { match: RegExp; kind: "subscription" | "bill" | "income"; frequency: string; latestCents: number };

// Small deterministic random so the fixture never changes between runs.
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
const ref = (n: number) => Array.from({ length: n }, () => pick("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789".split(""))).join("");

const START = "2026-05-01";
const END = "2026-10-31";
const days: string[] = [];
for (let d = START; d <= END; d = addDaysStr(d, 1)) days.push(d);
const monthDay = (day: number) => days.filter((d) => Number(d.slice(8)) === day);

export const txns: FixtureTxn[] = [];
const out = (date: string, cents: number, description: string, merchantName: string | null, categoryName: string | null, extra: Partial<FixtureTxn> = {}) =>
  txns.push({ date, amountCents: -cents, description, merchantName, kind: "expense", categoryName, ...extra });

// ---- Subscriptions ----
for (const d of monthDay(12)) out(d, 1549, "NETFLIX.COM 866-579-7172 CA", pick(["Netflix", null]), "Entertainment");
out("2026-10-12", 1549, "NETFLIX.COM 866-579-7172 CA", null, "Entertainment", { pending: true }); // pending copy of the posted one
for (const d of monthDay(3)) out(d, 1199, pick([`SPOTIFY USA 877-778-1161 NY`, `Spotify P${ref(9)}`]), pick(["Spotify", null]), "Entertainment");
for (const d of monthDay(21)) out(d, 299, "APPLE.COM/BILL 866-712-7753 CA", "Apple", "Software");
for (const d of monthDay(17)) out(d, 2000, "OPENAI *CHATGPT SUBSCR", "OpenAI", "Software");
for (const d of monthDay(1)) out(d, 2499, "PLANET FITNESS CLUB FEES 0425", "Planet Fitness", "Health & Fitness");
for (const d of monthDay(26)) out(d, 1499, `Amazon Prime*${ref(9)}`, "Amazon Prime", "Shopping");
for (const d of monthDay(8).filter((x) => x >= "2026-08-01")) out(d, 799, "PAYPAL *HULU 402-935-7733", null, "Entertainment");
for (const d of ["2026-09-19", "2026-10-19"]) out(d, 999, "DISNEY PLUS 888-905-7888 CA", "Disney+", "Entertainment");

// ---- Bills (amounts can vary) ----
for (const d of monthDay(15)) out(d, d < "2026-08-01" ? 6500 : 6812, "T-MOBILE *AUTOPAY 800-937-8997 WA", "T-Mobile", "Phone");
for (const d of monthDay(9)) out(d, between(7800, 14200), "GEORGIA POWER CO ONLINE PMT", "Georgia Power", "Utilities");
for (const d of monthDay(5)) out(d, 11840, `PROGRESSIVE *INSURANCE ${ref(6)}`, "Progressive", "Insurance");
for (const d of monthDay(1)) out(d, 95000, `RENT PAYMENT CAMPUS EDGE APTS ACH ${ref(8)}`, null, "Rent");

// ---- Income: biweekly paycheck ----
for (let d = "2026-05-08"; d <= END; d = addDaysStr(d, 14))
  txns.push({
    date: d,
    amountCents: between(61200, 69000),
    description: "TARGET CORP PAYROLL PPD ID: 1410296",
    merchantName: "Target",
    kind: "income",
    categoryName: "Paycheck",
  });

// ---- Everyday spending that repeats but is NOT a bill ----
for (const d of days) {
  const r = rnd();
  if (r < 0.32) out(d, between(475, 785), `STARBUCKS STORE ${between(10000, 99999)}`, "Starbucks", "Coffee");
  if (r > 0.9) out(d, between(1050, 1580), "CHIPOTLE 2291 ATLANTA GA", "Chipotle", "Dining");
  if (rnd() < 0.12) out(d, between(800, 2600), "UBER *TRIP HELP.UBER.COM", "Uber", "Transport");
  if (rnd() < 0.08) out(d, between(1200, 9800), `AMZN Mktp US*${ref(9)}`, "Amazon", "Shopping");
}
for (let d = "2026-05-02"; d <= END; d = addDaysStr(d, between(6, 9)))
  out(d, between(3500, 9000), `KROGER #${between(100, 999)} ATLANTA GA`, "Kroger", "Groceries");
for (let d = "2026-05-04"; d <= END; d = addDaysStr(d, between(9, 12))) out(d, between(3000, 4500), "SHELL OIL 57444810 ATLANTA GA", "Shell", "Gas");
for (let d = "2026-05-06"; d <= END; d = addDaysStr(d, between(10, 20)))
  txns.push({
    date: d,
    amountCents: -between(1500, 6000),
    description: "VENMO PAYMENT 1029384756",
    merchantName: "Venmo",
    kind: "transfer",
    categoryName: null,
  });
out("2026-07-14", 34999, "BEST BUY 00012 ATLANTA GA", "Best Buy", "Shopping");
// A real double charge and two bank fees in the last month (what the findings scan should catch).
out("2026-10-22", 4218, "TARGET T-1294 ATLANTA GA", "Target", "Shopping");
out("2026-10-23", 4218, "TARGET T-1294 ATLANTA GA", "Target", "Shopping");
out("2026-10-24", 3500, "OVERDRAFT FEE FOR A TRANSACTION", null, "Fees & Interest");
out("2026-10-27", 300, "NON-NETWORK ATM FEE", null, "Fees & Interest");

export const TODAY = END;

/** What a person would list as their recurring payments, and nothing else. */
export const truth: Truth[] = [
  { match: /netflix/i, kind: "subscription", frequency: "monthly", latestCents: 1549 },
  { match: /spotify/i, kind: "subscription", frequency: "monthly", latestCents: 1199 },
  { match: /apple/i, kind: "subscription", frequency: "monthly", latestCents: 299 },
  { match: /openai|chatgpt/i, kind: "subscription", frequency: "monthly", latestCents: 2000 },
  { match: /planet fitness/i, kind: "subscription", frequency: "monthly", latestCents: 2499 },
  { match: /prime/i, kind: "subscription", frequency: "monthly", latestCents: 1499 },
  { match: /hulu/i, kind: "subscription", frequency: "monthly", latestCents: 799 },
  { match: /disney/i, kind: "subscription", frequency: "monthly", latestCents: 999 },
  { match: /t-?mobile/i, kind: "bill", frequency: "monthly", latestCents: 6812 },
  { match: /georgia power/i, kind: "bill", frequency: "monthly", latestCents: 0 },
  { match: /progressive/i, kind: "bill", frequency: "monthly", latestCents: 11840 },
  { match: /rent|campus edge/i, kind: "bill", frequency: "monthly", latestCents: 95000 },
  { match: /target|payroll/i, kind: "income", frequency: "biweekly", latestCents: 0 },
];
