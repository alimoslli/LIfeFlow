import { and, eq, isNull, ne } from "drizzle-orm";
import { categories, categoryRules, transactions, type TransactionKind } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { notFound } from "../errors";
import { listCategories } from "./categories";
import { merchantKey } from "./recurring-detect";
import { inferKind } from "./transactions";

/**
 * Automatic categorization, in order of trust:
 *   1. the user's own rules (learned from their corrections),
 *   2. well-known merchant keywords,
 *   3. nothing (left uncategorized rather than guessed).
 */

/** Lowercase keyword (matched on word boundaries in merchant + description) → default category name. */
const KEYWORDS: [RegExp, string][] = [
  [/\b(uber ?eats|doordash|grubhub|postmates|seamless|instacart)\b/, "Food Delivery"],
  [/\b(starbucks|dunkin|peet'?s|tim hortons|dutch bros|coffee|cafe)\b/, "Coffee"],
  [/\b(trader joe'?s|whole foods|safeway|kroger|aldi|publix|wegmans|costco|sam'?s club|h ?e ?b|food lion|giant eagle|sprouts|grocery|market)\b/, "Groceries"],
  [
    /\b(mcdonald'?s|chipotle|chick ?fil ?a|subway|taco bell|wendy'?s|burger king|panera|domino'?s|pizza|kfc|sweetgreen|shake shack|restaurant|grill|diner)\b/,
    "Restaurants",
  ],
  [/\b(uber|lyft)\b/, "Rideshare"],
  [/\b(shell|chevron|exxon|mobil|bp|sunoco|valero|marathon|speedway|wawa|gas station|fuel)\b/, "Gas"],
  [/\b(mta|bart|metro|transit|septa|cta|marta|amtrak|caltrain|clipper|ventra)\b/, "Public Transit"],
  [/\b(parking|parkmobile|spothero)\b/, "Parking"],
  [/\b(netflix|hulu|disney ?\+?|disney plus|hbo max|hbo|spotify|apple music|youtube premium|paramount|peacock|crunchyroll)\b/, "Streaming"],
  [/\b(steam|playstation|xbox|nintendo|epic games)\b/, "Games"],
  [/\b(ticketmaster|stubhub|eventbrite|amc|regal|cinema)\b/, "Events"],
  [/\b(cvs|walgreens|rite aid|pharmacy)\b/, "Pharmacy"],
  [/\b(planet fitness|equinox|la fitness|gym|peloton|crunch fitness|ymca)\b/, "Fitness"],
  [/\b(verizon|t ?mobile|at ?& ?t|mint mobile|visible|cricket)\b/, "Phone"],
  [/\b(comcast|xfinity|spectrum|cox|optimum|fios|internet)\b/, "Internet"],
  [/\b(geico|progressive|state farm|allstate|lemonade|insurance)\b/, "Insurance"],
  [/\b(adobe|microsoft|google storage|icloud|dropbox|notion|chatgpt|openai|github)\b/, "Software"],
  [/\b(amazon|target|walmart|ikea|home depot|lowe'?s|bed bath)\b/, "Household"],
  [/\b(best buy|apple store|newegg)\b/, "Electronics"],
  [/\b(h ?& ?m|zara|uniqlo|nike|adidas|old navy|gap|nordstrom|shein)\b/, "Clothing"],
  [/\b(rent|apartments?|property management|landlord)\b/, "Rent"],
  [/\b(electric|con ?ed|pg ?& ?e|duke energy|water bill|utility)\b/, "Utilities"],
  [/\b(airbnb|hotel|marriott|hilton|hyatt|expedia|booking\.com|delta|united|american airlines|southwest|jetblue|spirit)\b/, "Travel"],
  [/\b(tuition|bursar|registrar)\b/, "Tuition"],
  [/\b(chegg|textbook|bookstore|pearson|mcgraw)\b/, "Books & Supplies"],
  [/\b(overdraft|late fee|interest charge|service fee|atm fee|foreign transaction)\b/, "Fees & Interest"],
  [/\b(payroll|direct dep(osit)?|salary|paycheck)\b/, "Paycheck"],
  [/\b(interest paid|interest earned)\b/, "Interest Income"],
  [/\b(autopay|card payment|payment thank you|payment received|credit card payment)\b/, "Credit Card Payment"],
  [/\b(transfer to savings|savings transfer)\b/, "Savings Transfer"],
  [/\b(venmo|zelle|cash app|paypal)\b/, ""], // person-to-person: too ambiguous to guess
];

export function keywordCategory(t: { merchantName?: string | null; description: string }): string | null {
  const text = ` ${(t.merchantName ?? "").toLowerCase()} ${t.description.toLowerCase()} `;
  for (const [re, name] of KEYWORDS) if (re.test(text)) return name || null;
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
]);
export const needOrWant = (categoryName: string | null | undefined): "need" | "want" => (categoryName && NEEDS.has(categoryName) ? "need" : "want");

/** The user's own rule for this merchant, if any (counts a hit). */
export async function ruleFor(scope: UserScope, t: { merchantName?: string | null; description: string }) {
  const key = merchantKey({ merchantName: t.merchantName ?? null, description: t.description });
  if (!key) return null;
  const [rule] = await scope.tx
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, scope.userId), eq(categoryRules.merchantKey, key)));
  if (!rule) return null;
  await scope.tx
    .update(categoryRules)
    .set({ hits: rule.hits + 1 })
    .where(eq(categoryRules.id, rule.id));
  return { categoryId: rule.categoryId, kind: rule.kind ?? undefined, via: "rule" as const };
}

/** Category id by default name for this user. */
export async function categoryIdByName(scope: UserScope, name: string) {
  const [cat] = await scope.tx
    .select()
    .from(categories)
    .where(and(eq(categories.userId, scope.userId), eq(categories.name, name)));
  return cat ?? null;
}

/** Picks a category (and kind) for a new transaction that arrived without one. */
export async function autoCategorize(scope: UserScope, t: { merchantName?: string | null; description: string; amountCents: number }) {
  const key = merchantKey({ merchantName: t.merchantName ?? null, description: t.description });
  if (key) {
    const [rule] = await scope.tx
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, scope.userId), eq(categoryRules.merchantKey, key)));
    if (rule) {
      await scope.tx
        .update(categoryRules)
        .set({ hits: rule.hits + 1 })
        .where(eq(categoryRules.id, rule.id));
      return { categoryId: rule.categoryId, kind: rule.kind ?? undefined, via: "rule" as const };
    }
  }
  const name = keywordCategory(t);
  if (!name) return null;
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
  const [rule] = await scope.tx
    .insert(categoryRules)
    .values({ userId: scope.userId, merchantKey: key, label, categoryId, kind: kind ?? null })
    .onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.merchantKey], set: { categoryId, kind: kind ?? null, label, updatedAt: new Date() } })
    .returning();
  const others = await matchingTransactions(scope, key, categoryId);
  return { rule, othersToUpdate: others.length };
}

async function matchingTransactions(scope: UserScope, key: string, categoryId: string) {
  const rows = await scope.tx
    .select({ id: transactions.id, merchantName: transactions.merchantName, description: transactions.description, categoryId: transactions.categoryId })
    .from(transactions)
    .where(eq(transactions.userId, scope.userId));
  return rows.filter((r) => r.categoryId !== categoryId && merchantKey(r) === key);
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
