/**
 * Turns a bank's statement line into the name a person would say.
 * "SQ *BLUE BOTTLE COFFEE 4411 SAN FRANCISCO CA" → "Blue Bottle Coffee",
 * "AMZN Mktp US*2K1AB3" → "Amazon", "POS DEBIT TST* CHICK-FIL-A #0412" → "Chick-fil-A".
 * Pure and conservative: it only removes what's clearly bank noise, and a clean name stays as it is.
 */

/** Marks a brand added when the list was narrowed (Nov 6, 2026): the earlier list didn't have it. */
const ADDED = false;

/**
 * Well-known merchants: the statement pattern, and the name to show. Order matters: specific first. A pattern
 * matches only that merchant: a shared word (Southwest Gas and Southwest Airlines, Costco's gas station and its
 * warehouse) or one company's separate services (Verizon Fios and Verizon Wireless) are different merchants, with
 * their own bills, categories and rules. The third value is the earlier, broader pattern a name was once stored
 * under (or ADDED), so those names can be put right (`correctedVendorName`).
 */
const BRANDS: [RegExp, string, (RegExp | typeof ADDED)?][] = [
  [/amazon prime|prime video|amzn prime/, "Amazon Prime"],
  [/amazon web services|\baws\b/, "Amazon Web Services", ADDED],
  [/amazon fresh/, "Amazon Fresh", ADDED],
  [/amazon music/, "Amazon Music", ADDED],
  [/amzn|amazon/, "Amazon"],
  [/apple cash/, "Apple Cash", ADDED],
  [/apple\.com\/bill|apple com bill|itunes|apple store/, "Apple", /apple\.com\/bill|apple com bill|itunes|apple store|apple cash/],
  [/google \*?(?:storage|one)|google play|goog\*/, "Google"],
  [/uber ?eats/, "Uber Eats"],
  [/\buber\b/, "Uber"],
  [/\blyft\b/, "Lyft"],
  [/door ?dash/, "DoorDash"],
  [/grubhub/, "Grubhub"],
  [/instacart/, "Instacart"],
  [/netflix/, "Netflix"],
  [/spotify/, "Spotify"],
  [/hulu/, "Hulu"],
  [/disney ?(?:\+|plus)/, "Disney+"],
  [/hbo ?max|\bmax\.com/, "Max"],
  [/youtube ?tv/, "YouTube TV", ADDED],
  [/youtube ?(?:premium)?/, "YouTube", /youtube ?(?:premium|tv)?/],
  [/chat ?gpt|openai/, "OpenAI"],
  [/adobe/, "Adobe"],
  [/starbucks/, "Starbucks"],
  [/dunkin/, "Dunkin'"],
  [/dutch bros/, "Dutch Bros"],
  [/mcdonald/, "McDonald's"],
  [/chick-?fil-?a/, "Chick-fil-A"],
  [/chipotle/, "Chipotle"],
  [/taco bell/, "Taco Bell"],
  [/wendy'?s/, "Wendy's"],
  [/burger king/, "Burger King"],
  [/panera/, "Panera"],
  [/domino'?s/, "Domino's"],
  // The sandwich shop, not a subway fare ("MTA*NYCT PAYGO SUBWAY").
  [/^(?!.*\b(?:mta|nyct|transit|metro|bart|septa|marta|cta|wmata)\b).*\bsubway\b(?! station| fare)/, "Subway", /subway(?! station)/],
  [/walmart|wal-mart/, "Walmart"],
  [/\btarget\b/, "Target"],
  [/costco (?:gas|fuel)/, "Costco Gas", ADDED],
  [/costco/, "Costco"],
  [/trader joe/, "Trader Joe's"],
  [/whole foods/, "Whole Foods"],
  [/kroger fuel|kroger gas/, "Kroger Fuel", ADDED],
  [/kroger/, "Kroger"],
  [/publix/, "Publix"],
  [/safeway (?:fuel|gas)/, "Safeway Fuel", ADDED],
  [/safeway/, "Safeway"],
  [/\baldi\b/, "Aldi"],
  [/\bh-?e-?b\b/, "H-E-B"],
  [/\bcvs(?:pharmacy)?\b/, "CVS", /cvs/],
  [/walgreens/, "Walgreens"],
  [/home depot/, "Home Depot"],
  [/\blowe'?s\b/, "Lowe's", /lowe'?s/],
  [/best buy/, "Best Buy"],
  [/\bikea\b/, "IKEA"],
  // The gas station, not a restaurant or a shop with "shell" in its name.
  [/shell oil|shell service|^shell(?: \d| #|$)/, "Shell", /shell oil|\bshell\b/],
  [/chevron/, "Chevron"],
  [/exxon/, "Exxon"],
  [/\bbp\b/, "BP"],
  [/wawa/, "Wawa"],
  [/planet fitness/, "Planet Fitness"],
  [/t-?mobile/, "T-Mobile"],
  [/verizon fios|\bfios\b/, "Verizon Fios", ADDED],
  [/verizon/, "Verizon"],
  [/at ?& ?t|\batt\b/, "AT&T"],
  [/xfinity mobile|comcast mobile/, "Xfinity Mobile", ADDED],
  [/comcast|xfinity/, "Xfinity"],
  [/venmo/, "Venmo"],
  [/cash ?app/, "Cash App"],
  [/zelle/, "Zelle"],
  [/paypal/, "PayPal"],
  [/delta air/, "Delta"],
  [/united airlines/, "United Airlines"],
  [/american airlines/, "American Airlines"],
  [/southwest air(?:lines)?\b|southwes air|\bswa\b/, "Southwest Airlines", /southwest/],
  [/airbnb/, "Airbnb"],
  [/ticketmaster/, "Ticketmaster"],
];

/** Words that carry no meaning on a statement. */
const LEAD =
  /^(?:(?:pos|ach|web|ppd|recurring|online|debit|credit|card|purchase|payment|pmt|pymt|checkcard|visa|mastercard|dda|pur|auth(?:orized)?|on|withdrawal)\b[\s:-]*)+/i;
const PROCESSOR = /^(?:paypal|pp|sq|tst|sp|py|ckc|dd|goog|apl|in|pos|ts)\s*\*\s*/i;
const SMALL = new Set(["and", "of", "the", "at", "in", "on", "for", "to", "a"]);
const STATES = new Set(
  "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(
    " ",
  ),
);

const CITY_START = new Set("san los las new st saint santa fort el la salt palo north south east west port mount".split(" "));

/** What follows an apostrophe in a possessive or contraction (Shell's, Don't, We'll), which stays lower case. */
const CONTRACTION = /^(?:s|t|d|m|re|ll|ve)$/;

function titleCase(s: string) {
  return s
    .split(" ")
    .map((w, i) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      // Short all-consonant tokens are acronyms (KFC, CVS, UPS); mixed words are names.
      if (w.length <= 4 && !/[aeiouy]/i.test(w)) return w.toUpperCase();
      // The first letter after an apostrophe is capitalised in a name (O'Brien) but not in a contraction or possessive (Shell's, Don't).
      return lower.replace(/(^|[-'’./])([a-z])([a-z]*)/g, (_m, a: string, b: string, rest: string) =>
        (a === "'" || a === "’") && CONTRACTION.test(b + rest) ? a + b + rest : a + b.toUpperCase() + rest,
      );
    })
    .join(" ");
}

/** The well-known merchant a line names ("COMCAST" and "Xfinity" are both "Xfinity"), if any. */
export function brandName(raw: string | null | undefined): string | null {
  const lowered = (raw ?? "").trim().toLowerCase().replace(/\*/g, " ").replace(/\s+/g, " ");
  if (!lowered) return null;
  for (const [re, name] of BRANDS) if (re.test(lowered)) return name;
  return null;
}

/**
 * The name the earlier, broader list gave a line ("SOUTHWEST GAS" was "Southwest Airlines", "VERIZON FIOS" was
 * "Verizon"). Rows tidied then still carry it.
 */
function earlierBrandName(raw: string): string | null {
  const lowered = raw.trim().toLowerCase().replace(/\*/g, " ").replace(/\s+/g, " ");
  for (const [re, name, was] of BRANDS) if (was !== ADDED && (was ?? re).test(lowered)) return name;
  return null;
}
const EARLIER_NAMES = new Set(BRANDS.filter(([, , was]) => was !== ADDED).map(([, name]) => name));

/**
 * Today's name for a row whose stored name came from the earlier, broader list: a Southwest Gas bill stored as
 * "Southwest Airlines", Fios as "Verizon", YouTube TV as "YouTube". It's recomputed from the bank's own line. Null
 * when there's nothing to put right: the stored name isn't what the earlier list gave this line (it's Plaid's, or
 * one the person typed: "Hulu" on an "APPLE.COM/BILL HULU" line, "Gas bill"), or it's still today's name.
 */
export function correctedVendorName(stored: string | null | undefined, line: string): string | null {
  const name = stored?.trim();
  if (!name || !EARLIER_NAMES.has(name) || earlierBrandName(line) !== name) return null;
  const now = cleanVendorName(line);
  return now && now !== name ? now : null;
}

export function cleanVendorName(raw: string | null | undefined): string {
  const original = (raw ?? "").trim();
  if (!original) return "";
  const brand = brandName(original);
  if (brand) return brand;

  // A number that opens the name belongs to it when a word follows (7-Eleven, 99 Ranch, 76 Gas, 24 Hour Fitness); store numbers,
  // card digits and references come after the name or are longer (1103, 0231), and dates have a slash.
  const opened = original
    .replace(/\s+/g, " ")
    .replace(LEAD, "")
    .replace(PROCESSOR, "")
    .replace(/^(?:(?:purchase )?authorized on )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/i, ""); // a date in front
  const owned = /^(\d{1,2})([- ])(?=[a-z]{3})/i.exec(opened);
  let s = (owned ? opened.slice(owned[0].length) : opened)
    .replace(/\b(?:purchase )?authorized on \d{1,2}\/\d{1,2}\b/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ") // dates
    .replace(/\(?\b\d{3}\)?[-. ]?\d{3}[-. ]\d{4}\b/g, " ") // phone numbers
    .replace(/#\s*\d+/g, " ") // store numbers
    .replace(/\bstore\s*\d+\b/gi, " ")
    .replace(/\b(?:www\.)|(?:\.(?:com|net|org|co|io))\b/gi, " ")
    .replace(/[*_]+/g, " ")
    .replace(/\b[a-z0-9]*\d[a-z0-9]*\b/gi, (w) => (/^\d{1,2}(?:st|nd|rd|th)$/i.test(w) || /^[a-z]+\d$/i.test(w) ? w : " ")) // ids and store numbers (words with digits)
    .replace(/\s+/g, " ")
    .trim();
  if (owned && s) s = owned[1] + owned[2] + s;

  // Statement words anywhere in the line ("... ACH", "RENT PAYMENT ..."): dropped when a name is left.
  const drop = new Set(["ach", "ppd", "pmt", "pymt", "autopay", "web", "debit", "recurring", "online", "payment"]);
  const kept = s.split(" ").filter((w) => !drop.has(w.toLowerCase()));
  if (kept.length >= 2 || (kept.length === 1 && s.split(" ").length === 1)) s = kept.join(" ");

  // "... SAN FRANCISCO CA": a trailing state code, and the city before it when the name is long enough to spare it.
  const words = s.split(" ");
  if (words.length > 2 && STATES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
    if (words.length > 2) {
      // The city before the state: one word, or two when it starts like "San Francisco" / "New York".
      const two = CITY_START.has(words[words.length - 2].toLowerCase());
      words.splice(two && words.length > 3 ? -2 : -1, two && words.length > 3 ? 2 : 1);
    }
  }
  s = words
    .join(" ")
    .replace(/[\s\-.,:;&]+$/g, "")
    .replace(/^[\s\-.,:;]+/g, "");
  if (!s) return original.slice(0, 40);
  // Already mixed-case ("Joe's Pizza") means a human or Plaid wrote it: keep their casing.
  const name = /[a-z]/.test(s) && /[A-Z]/.test(s) ? s : titleCase(s);
  return name.length > 40 ? name.slice(0, 40).replace(/\s+\S*$/, "") : name;
}

/** True when a name still looks like statement noise (digits, long all-caps runs). Used to pick what the AI pass should look at. */
export function looksMessy(name: string) {
  return /\d{3,}|\*|#/.test(name) || (name.length > 14 && name === name.toUpperCase());
}
