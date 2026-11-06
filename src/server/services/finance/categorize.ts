import { and, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { addDaysStr } from "@/lib/dates";
import { categories, categoryRules, transactions, type TransactionKind } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { notFound } from "../errors";
import { ensureDefaultCategories, listCategories } from "./categories";
import { brandName } from "@/lib/vendor";
import { merchantKey, merchantKeys, storedKeyForms } from "./recurring-detect";
import { inferKind } from "./transactions";

/**
 * Automatic categorization, in order of trust:
 *   1. the user's own rules (learned from their corrections),
 *   2. well-known merchant keywords,
 *   3. nothing (left uncategorized rather than guessed).
 */

/** Money coming in: only these ever apply to a deposit, so a paycheck from Target is never "Household". */
const INCOME_KEYWORDS: [RegExp, string][] = [
  [/\b(payroll|direct dep(osit)?|dir dep|salary|paycheck|wages|adp|gusto|paychex|trinet|workday pay)\b/, "Paycheck"],
  [/\b(dasher|doordash|uber|lyft|instacart|shipt|grubhub|etsy|ebay|fiverr|upwork|rover|tutor)\b/, "Side Income"],
  [/\b(interest paid|interest earned|int earned|dividend)\b/, "Interest Income"],
];

/** Lowercase keyword (matched on word boundaries in merchant + description) → default category name. Order matters: specific first. */
const KEYWORDS: [RegExp, string][] = [
  [/\b(overdraft|nsf|insufficient funds|late fee|interest charge|service fee|maintenance fee|atm fee|foreign transaction)\b/, "Fees & Interest"],
  [/\b(total wine|bevmo|liquor|wine (&|and) spirits|brewery|brewing co|taproom|tavern|saloon|pub)\b/, "Bars & Alcohol"],
  [/\b(uber ?eats|doordash|grubhub|postmates|seamless|instacart)\b/, "Food Delivery"],
  [/\b(starbucks|dunkin|peet'?s|tim hortons|dutch bros|coffee|cafe)\b/, "Coffee"],
  [
    /\b(trader joe'?s|whole foods|safeway|kroger|aldi|publix|wegmans|costco|sam'?s club|h ?e ?b|food lion|giant eagle|sprouts|grocery|supermarket|market|meijer|hy-?vee|winco|stop ?& ?shop|food 4 less|smart ?& ?final)\b/,
    "Groceries",
  ],
  [
    /\b(mcdonald'?s|chipotle|chick ?fil ?a|subway|taco bell|wendy'?s|burger king|panera|domino'?s|pizza|kfc|sweetgreen|shake shack|panda express|five guys|jersey mike'?s|wingstop|popeyes|raising cane'?s|in-n-out|jack in the box|sonic drive|arby'?s|cava|qdoba|noodles|ihop|denny'?s|applebee'?s|olive garden|buffalo wild|restaurant|grill|diner|bistro|kitchen|taqueria|sushi|ramen|bbq)\b/,
    "Restaurants",
  ],
  [/\b(uber|lyft)\b/, "Rideshare"],
  [/\b(verizon|t[- ]?mobile|at ?& ?t|mint mobile|visible|cricket|xfinity mobile|boost mobile|metro by)\b/, "Phone"],
  [/\b(supercharger|chargepoint|evgo|electrify america|ev charging)\b/, "EV Charging"],
  [/\b(jiffy lube|autozone|o'?reilly auto|advance auto|pep boys|valvoline|midas|discount tire|car wash|dmv)\b/, "Car Maintenance"],
  [/\b(shell|chevron|exxon|mobil|bp|sunoco|valero|marathon|speedway|wawa|quiktrip|racetrac|gas station|fuel)\b/, "Gas"],
  [/\b(mta|bart|metro|transit|septa|cta|marta|amtrak|caltrain|clipper|ventra)\b/, "Public Transit"],
  [/\b(parking|parkmobile|spothero)\b/, "Parking"],
  [/\b(netflix|hulu|disney ?\+?|disney plus|hbo max|hbo|spotify|apple music|youtube premium|paramount|peacock|crunchyroll)\b/, "Streaming"],
  [/\b(amazon prime|prime video|apple\.com\/bill|apple com bill|itunes|google \*|patreon|audible|siriusxm)\b/, "Subscriptions"],
  [/\b(steam|playstation|xbox|nintendo|epic games)\b/, "Games"],
  [/\b(ticketmaster|stubhub|eventbrite|amc|regal|cinema)\b/, "Events"],
  [/\b(cvs|walgreens|rite aid|pharmacy)\b/, "Pharmacy"],
  [/\b(dentist|orthodont\w*|optometrist|eye care|lenscrafters|warby parker|vision center)\b/, "Dental & Vision"],
  [/\b(therapy|therapist|counseling|psychiatr\w*|betterhelp|talkspace|headspace therapy)\b/, "Mental Health"],
  [/\b(urgent care|clinic|hospital|medical|doctor|physician|labcorp|quest diagnostics|copay)\b/, "Medical"],
  [/\b(sephora|ulta|barber|salon|haircut|nail spa|great clips|supercuts|sally beauty)\b/, "Personal Care"],
  [/\b(gofundme|red cross|donation|charity|church|unicef|st jude)\b/, "Gifts & Donations"],
  [/\b(planet fitness|equinox|la fitness|gym|peloton|crunch fitness|ymca)\b/, "Fitness"],
  [/\b(comcast|xfinity|spectrum|cox|optimum|fios|internet)\b/, "Internet"],
  [/\b(geico|progressive|state farm|allstate|lemonade|insurance|dental|vision plan)\b/, "Insurance"],
  [/\b(adobe|microsoft|google storage|icloud|dropbox|notion|chatgpt|openai|github|canva|grammarly)\b/, "Software"],
  [/\b(best buy|apple store|newegg)\b/, "Electronics"],
  [/\b(amazon|amzn|etsy|ebay|temu|aliexpress|shopify|wish\.com|walmart\.com|target\.com)\b/, "Online Shopping"],
  [/\b(petco|petsmart|chewy|veterinar\w*|vet clinic|banfield)\b/, "Pets"],
  [/\b(dick'?s sporting|academy sports|decathlon|rei|golf|ski|climbing|rec league|sports authority)\b/, "Sports"],
  [
    /\b(topgolf|bowling|museum|zoo|aquarium|escape room|arcade|theme park|six flags|dave (&|and) buster'?s|trampoline|laser tag|mini golf|tour|workshop|class pass|classpass)\b/,
    "Activities",
  ],
  [/\b(guitar center|michaels|hobby lobby)\b/, "Hobbies & Sports"],
  [/\b(spa|massage|wellness|yoga|pilates|meditation|calm|tattoo|florist|flowers|dating|hinge|tinder|bumble)\b/, "Lifestyle"],
  [/\b(atm withdrawal|cash withdrawal|atm w\/d)\b/, "Cash & ATM"],
  [/\b(target|walmart|ikea|home depot|lowe'?s|bed bath|dollar general|dollar tree)\b/, "Household"],
  [/\b(h ?& ?m|zara|uniqlo|nike|adidas|old navy|gap|nordstrom|shein)\b/, "Clothing"],
  [/\b(rent|apartments?|apts|property management|landlord)\b/, "Rent"],
  [
    /\b(electric|power|energy|con ?ed|pg ?& ?e|duke energy|water|sewer|gas company|utility|utilities|dominion|xcel|entergy|national grid|pseg|edison|fpl)\b/,
    "Utilities",
  ],
  [/\b(delta air|united airlines|american airlines|southwest|jetblue|spirit airlines|frontier airlines|alaska air|allegiant)\b/, "Flights"],
  [/\b(airbnb|vrbo|hotel|motel|marriott|hilton|hyatt|holiday inn|best western|hostel|resort)\b/, "Hotels & Lodging"],
  [/\b(expedia|booking\.com|kayak|priceline|tsa precheck|amtrak tours)\b/, "Travel"],
  [/\b(tuition|bursar|registrar)\b/, "Tuition"],
  [/\b(chegg|textbook|bookstore|pearson|mcgraw)\b/, "Books & Supplies"],
  [
    /\b(credit crd|credit card payment|card payment|payment thank you|payment received|capital one|discover|amex|american express|citi card|chase card|epay)\b/,
    "Credit Card Payment",
  ],
  [/\b(transfer to savings|savings transfer)\b/, "Savings Transfer"],
  [/\b(venmo|zelle|cash app|paypal)\b/, ""], // person-to-person: too ambiguous to guess
];

/**
 * A default category from the statement line. Deposits only match income patterns
 * (a refund or a transfer in is left for Plaid or the user to decide).
 */
export function keywordCategory(t: { merchantName?: string | null; description: string }, amountCents = -1): string | null {
  const text = ` ${(t.merchantName ?? "").toLowerCase()} ${t.description.toLowerCase()} `;
  for (const [re, name] of amountCents > 0 ? INCOME_KEYWORDS : KEYWORDS) if (re.test(text)) return name || null;
  return null;
}

/** 50/30/20 grouping of the default categories. Anything unknown counts as a want. */
const NEEDS = new Set([
  "Housing",
  "Rent",
  "Utilities",
  "Internet",
  "Groceries",
  "Transportation",
  "Gas",
  "Public Transit",
  "Parking",
  "Health",
  "Pharmacy",
  "Medical",
  "Insurance",
  "Phone",
  "Education",
  "Tuition",
  "Books & Supplies",
  "Fees & Interest",
  "Bills & Subscriptions",
  "Car Maintenance",
  "Dental & Vision",
  "Mental Health",
]);
export const needOrWant = (categoryName: string | null | undefined): "need" | "want" => (categoryName && NEEDS.has(categoryName) ? "need" : "want");

/** Rules saved under a name the vendor tidy now maps to a brand ("comcast", "hbo max"), loaded once per transaction. */
const brandedRules = new WeakMap<UserScope["tx"], Promise<(typeof categoryRules.$inferSelect)[]>>();
const forgetBrandedRules = (scope: UserScope) => brandedRules.delete(scope.tx);

/**
 * The user's rule for a transaction: saved under one of its keys, or under the name its merchant had before the
 * vendor tidy (a rule for "comcast" still applies to a row now shown as Xfinity). Read-time only: rules aren't rewritten.
 */
export async function findRule(scope: UserScope, t: { merchantName?: string | null; description: string }) {
  const keys = merchantKeys({ merchantName: t.merchantName ?? null, description: t.description });
  if (!keys.length) return null;
  const [rule] = await scope.tx
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, scope.userId), inArray(categoryRules.merchantKey, keys)));
  if (rule || !brandName(t.merchantName || t.description)) return rule ?? null;
  if (!brandedRules.has(scope.tx))
    brandedRules.set(
      scope.tx,
      scope.tx
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.userId, scope.userId))
        .then((rows) => rows.filter((r) => storedKeyForms(r.merchantKey).length > 1)),
    );
  return (await brandedRules.get(scope.tx)!).find((r) => storedKeyForms(r.merchantKey).some((k) => keys.includes(k))) ?? null;
}

/** The user's own rule for this merchant, if any (counts a hit). */
export async function ruleFor(scope: UserScope, t: { merchantName?: string | null; description: string }) {
  const rule = await findRule(scope, t);
  if (!rule) return null;
  await scope.tx
    .update(categoryRules)
    .set({ hits: rule.hits + 1 })
    .where(eq(categoryRules.id, rule.id));
  return { categoryId: rule.categoryId, kind: rule.kind ?? undefined, via: "rule" as const };
}

/** Category id by default name for this user. */
export async function categoryIdByName(scope: UserScope, name: string) {
  await ensureDefaultCategories(scope);
  const [cat] = await scope.tx
    .select()
    .from(categories)
    .where(and(eq(categories.userId, scope.userId), eq(categories.name, name)));
  return cat ?? null;
}

/** Picks a category (and kind) for a new transaction that arrived without one. */
export async function autoCategorize(scope: UserScope, t: { merchantName?: string | null; description: string; amountCents: number }) {
  {
    const rule = await findRule(scope, t);
    if (rule) {
      await scope.tx
        .update(categoryRules)
        .set({ hits: rule.hits + 1 })
        .where(eq(categoryRules.id, rule.id));
      return { categoryId: rule.categoryId, kind: rule.kind ?? undefined, via: "rule" as const };
    }
  }
  const name = keywordCategory(t, t.amountCents);
  if (!name) return null;
  await ensureDefaultCategories(scope);
  const [cat] = await scope.tx
    .select()
    .from(categories)
    .where(and(eq(categories.userId, scope.userId), eq(categories.name, name)));
  if (!cat) return null;
  return { categoryId: cat.id, kind: inferKind(t.amountCents, cat.kind), via: "keyword" as const };
}

/**
 * Remembers the user's correction as a rule for this merchant, and reports
 * how many other transactions from the same merchant are categorized
 * differently, so the UI can offer to fix them too.
 */
export async function learnCategoryRule(
  scope: UserScope,
  txn: { merchantName: string | null; description: string },
  categoryId: string,
  kind?: TransactionKind,
) {
  const key = merchantKey(txn);
  if (!key) return null;
  const label = (txn.merchantName || txn.description).slice(0, 120);
  // An older rule for the same merchant (a previous key format, or its name before the vendor tidy) is replaced by this correction.
  const keys = merchantKeys(txn);
  const existing = await scope.tx
    .select({ id: categoryRules.id, merchantKey: categoryRules.merchantKey })
    .from(categoryRules)
    .where(eq(categoryRules.userId, scope.userId));
  const stale = existing.filter((r) => r.merchantKey !== key && storedKeyForms(r.merchantKey).some((k) => keys.includes(k))).map((r) => r.id);
  if (stale.length) await scope.tx.delete(categoryRules).where(and(eq(categoryRules.userId, scope.userId), inArray(categoryRules.id, stale)));
  const [rule] = await scope.tx
    .insert(categoryRules)
    .values({ userId: scope.userId, merchantKey: key, label, categoryId, kind: kind ?? null })
    .onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.merchantKey], set: { categoryId, kind: kind ?? null, label, updatedAt: new Date() } })
    .returning();
  forgetBrandedRules(scope);
  const others = await matchingTransactions(scope, key, categoryId);
  return { rule, othersToUpdate: others.length };
}

async function matchingTransactions(scope: UserScope, key: string, categoryId: string) {
  const rows = await scope.tx
    .select({ id: transactions.id, merchantName: transactions.merchantName, description: transactions.description, categoryId: transactions.categoryId })
    .from(transactions)
    .where(eq(transactions.userId, scope.userId));
  const forms = storedKeyForms(key);
  return rows.filter((r) => r.categoryId !== categoryId && merchantKeys(r).some((k) => forms.includes(k)));
}

/** Applies a rule to existing transactions from that merchant. Returns how many changed. */
export async function applyRuleToPast(scope: UserScope, ruleId: string) {
  const [rule] = await scope.tx
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.userId, scope.userId)));
  if (!rule) throw notFound("Rule");
  const rows = await matchingTransactions(scope, rule.merchantKey, rule.categoryId);
  for (const r of rows)
    await scope.tx
      .update(transactions)
      .set({ categoryId: rule.categoryId, ...(rule.kind && { kind: rule.kind }) })
      .where(eq(transactions.id, r.id));
  return rows.length;
}

export async function listCategoryRules(scope: UserScope) {
  const cats = await listCategories(scope);
  const rows = await scope.tx.select().from(categoryRules).where(eq(categoryRules.userId, scope.userId));
  return rows.map((r) => ({ ...r, categoryName: cats.find((c) => c.id === r.categoryId)?.name ?? "Unknown" })).sort((a, b) => a.label.localeCompare(b.label));
}

export async function deleteCategoryRule(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, scope.userId)))
    .returning({ id: categoryRules.id });
  forgetBrandedRules(scope);
  if (!row) throw notFound("Rule");
}

/** Categorizes existing uncategorized transactions with rules and keywords. */
export async function categorizeUncategorized(scope: UserScope) {
  const rows = await scope.tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, scope.userId), isNull(transactions.categoryId), ne(transactions.kind, "transfer")));
  let n = 0;
  for (const t of rows) {
    const c = await autoCategorize(scope, t);
    if (!c) continue;
    await scope.tx
      .update(transactions)
      .set({ categoryId: c.categoryId, ...(c.kind && { kind: c.kind }) })
      .where(eq(transactions.id, t.id));
    n++;
  }
  return n;
}

/**
 * Transactions Jarvis isn't sure about, for him to ask the user (two-way, not guessed):
 * no category, a deposit sitting in a spending category, or spending in an income one.
 * Each comes with his best guess so the user can just say "yes" or correct it.
 */
export async function transactionsToReview(scope: UserScope, today: string, limit = 10) {
  const rows = await scope.tx
    .select({ t: transactions, categoryName: categories.name, categoryKind: categories.kind })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, scope.userId),
        eq(transactions.pending, false),
        ne(transactions.kind, "transfer"),
        gte(transactions.date, addDaysStr(today, -60)),
        lte(transactions.date, today),
      ),
    )
    .orderBy(desc(transactions.date));
  const items = rows.flatMap(({ t, categoryName, categoryKind }) => {
    const reason = !t.categoryId
      ? "no category"
      : t.amountCents > 0 && categoryKind === "expense" && t.kind !== "refund"
        ? "money in, filed as spending"
        : t.amountCents < 0 && categoryKind === "income"
          ? "money out, filed as income"
          : null;
    if (!reason) return [];
    return [
      {
        id: t.id,
        date: t.date,
        description: t.merchantName || t.description,
        amountCents: t.amountCents,
        currentCategory: categoryName ?? null,
        bestGuess: keywordCategory(t, t.amountCents),
        reason,
      },
    ];
  });
  return { total: items.length, items: items.slice(0, limit) };
}
