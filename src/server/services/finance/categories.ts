import { and, asc, eq } from "drizzle-orm";
import { categories } from "../../db/schema";
import type { UserScope } from "../../db/with-user";

type Seed = { name: string; kind: "expense" | "income" | "transfer"; color: string; children?: string[] };

export const DEFAULT_CATEGORIES: Seed[] = [
  { name: "Food & Dining", kind: "expense", color: "#d97706", children: ["Groceries", "Restaurants", "Coffee", "Food Delivery", "Bars & Alcohol"] },
  { name: "Housing", kind: "expense", color: "#7c3aed", children: ["Rent", "Utilities", "Internet"] },
  { name: "Transportation", kind: "expense", color: "#0891b2", children: ["Gas", "EV Charging", "Rideshare", "Public Transit", "Parking", "Car Maintenance"] },
  { name: "Shopping", kind: "expense", color: "#db2777", children: ["Clothing", "Electronics", "Household", "Online Shopping"] },
  { name: "Entertainment", kind: "expense", color: "#ea580c", children: ["Streaming", "Events", "Games", "Hobbies & Sports"] },
  { name: "Health", kind: "expense", color: "#059669", children: ["Pharmacy", "Fitness", "Medical", "Dental & Vision", "Mental Health"] },
  { name: "Education", kind: "expense", color: "#2563eb", children: ["Tuition", "Books & Supplies"] },
  { name: "Bills & Subscriptions", kind: "expense", color: "#4f46e5", children: ["Phone", "Insurance", "Software", "Subscriptions"] },
  { name: "Personal Care", kind: "expense", color: "#c026d3" },
  { name: "Pets", kind: "expense", color: "#a16207" },
  { name: "Cash & ATM", kind: "expense", color: "#475569" },
  { name: "Travel", kind: "expense", color: "#0d9488", children: ["Flights", "Hotels & Lodging"] },
  { name: "Lifestyle", kind: "expense", color: "#e11d48" },
  { name: "Activities", kind: "expense", color: "#f59e0b" },
  { name: "Sports", kind: "expense", color: "#65a30d" },
  { name: "Gifts & Donations", kind: "expense", color: "#be123c" },
  { name: "Fees & Interest", kind: "expense", color: "#64748b" },
  { name: "Other", kind: "expense", color: "#94a3b8" },
  { name: "Income", kind: "income", color: "#16a34a", children: ["Paycheck", "Side Income", "Interest Income"] },
  { name: "Transfers", kind: "transfer", color: "#6b7280", children: ["Credit Card Payment", "Savings Transfer", "Investment Transfer"] },
];

export async function seedDefaultCategories({ tx, userId }: UserScope) {
  for (const seed of DEFAULT_CATEGORIES) {
    const [parent] = await tx
      .insert(categories)
      .values({ userId, name: seed.name, kind: seed.kind, color: seed.color, isSystem: true })
      .onConflictDoNothing()
      .returning();
    if (!parent || !seed.children) continue;
    await tx
      .insert(categories)
      .values(seed.children.map((name) => ({ userId, name, kind: seed.kind, color: seed.color, parentId: parent.id, isSystem: true })))
      .onConflictDoNothing();
  }
}

/** Defaults added after launch. Older accounts get just these, once; categories they deleted or renamed earlier stay as they chose. */
const ADDED_LATER: { name: string; parent?: string }[] = [
  { name: "Online Shopping", parent: "Shopping" },
  { name: "Bars & Alcohol", parent: "Food & Dining" },
  { name: "Car Maintenance", parent: "Transportation" },
  { name: "Hobbies & Sports", parent: "Entertainment" },
  { name: "Subscriptions", parent: "Bills & Subscriptions" },
  { name: "Pets" },
  { name: "Cash & ATM" },
  { name: "EV Charging", parent: "Transportation" },
  { name: "Dental & Vision", parent: "Health" },
  { name: "Mental Health", parent: "Health" },
  { name: "Flights", parent: "Travel" },
  { name: "Hotels & Lodging", parent: "Travel" },
  { name: "Lifestyle" },
  { name: "Activities" },
  { name: "Sports" },
];

/** Adds the newer default categories an older account is missing. Safe to repeat; costs one small query once they exist. */
export async function ensureDefaultCategories(scope: UserScope) {
  const have = await scope.tx.select({ name: categories.name }).from(categories).where(eq(categories.userId, scope.userId));
  const names = new Set(have.map((c) => c.name));
  if (names.has("Activities")) return false; // the newest default: this account already has them all
  if (!names.size) return false; // brand new account: registration seeds everything
  for (const c of ADDED_LATER) {
    if (names.has(c.name)) continue;
    const seed = DEFAULT_CATEGORIES.find((d) => d.name === (c.parent ?? c.name));
    const [parent] = c.parent
      ? await scope.tx
          .select()
          .from(categories)
          .where(and(eq(categories.userId, scope.userId), eq(categories.name, c.parent)))
      : [];
    if (c.parent && !parent) continue; // they removed the group; don't bring it back
    await scope.tx
      .insert(categories)
      .values({ userId: scope.userId, name: c.name, kind: "expense", color: seed?.color ?? "#94a3b8", parentId: parent?.id ?? null, isSystem: true })
      .onConflictDoNothing();
  }
  return true;
}

export async function listCategories(scope: UserScope) {
  await ensureDefaultCategories(scope);
  return scope.tx.select().from(categories).where(eq(categories.userId, scope.userId)).orderBy(asc(categories.name));
}

/** "Food and dining!" → "food dining"; plurals and "&"/"and" don't matter. */
export const normCategory = (s: string) =>
  s
    .toLowerCase()
    .replace(/&|\band\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");

/** Everyday words for the default categories (normalized → default name). Only used when no category has that name. */
const SYNONYMS: Record<string, string> = {
  food: "Food & Dining",
  dining: "Restaurants",
  "eating out": "Restaurants",
  "fast food": "Restaurants",
  takeout: "Food Delivery",
  delivery: "Food Delivery",
  grocery: "Groceries",
  "grocery store": "Groceries",
  supermarket: "Groceries",
  cafe: "Coffee",
  uber: "Rideshare",
  lyft: "Rideshare",
  taxi: "Rideshare",
  "ride share": "Rideshare",
  transport: "Transportation",
  car: "Transportation",
  fuel: "Gas",
  gasoline: "Gas",
  bus: "Public Transit",
  train: "Public Transit",
  subway: "Public Transit",
  transit: "Public Transit",
  housing: "Housing",
  utility: "Utilities",
  electric: "Utilities",
  electricity: "Utilities",
  wifi: "Internet",
  "cell phone": "Phone",
  "phone bill": "Phone",
  subscription: "Bills & Subscriptions",
  bill: "Bills & Subscriptions",
  app: "Software",
  apps: "Software",
  clothe: "Clothing",
  clothes: "Clothing",
  shoe: "Clothing",
  tech: "Electronics",
  home: "Household",
  "home good": "Household",
  movie: "Events",
  concert: "Events",
  ticket: "Events",
  gaming: "Games",
  "video game": "Games",
  medicine: "Pharmacy",
  doctor: "Medical",
  dentist: "Medical",
  healthcare: "Health",
  gym: "Fitness",
  school: "Education",
  college: "Education",
  textbook: "Books & Supplies",
  book: "Books & Supplies",
  supplies: "Books & Supplies",
  haircut: "Personal Care",
  beauty: "Personal Care",
  makeup: "Personal Care",
  trip: "Travel",
  vacation: "Travel",
  flight: "Travel",
  hotel: "Travel",
  gift: "Gifts & Donations",
  donation: "Gifts & Donations",
  charity: "Gifts & Donations",
  fee: "Fees & Interest",
  interest: "Fees & Interest",
  misc: "Other",
  miscellaneous: "Other",
  salary: "Paycheck",
  pay: "Paycheck",
  wage: "Paycheck",
  "side hustle": "Side Income",
  freelance: "Side Income",
  transfer: "Transfers",
};

const SYNONYM_INDEX = new Map(Object.entries(SYNONYMS).map(([k, v]) => [normCategory(k), v]));

/** The one category a name means: exact, then normalized, then an everyday word, then a single partial match. */
export function matchCategory<T extends { id: string; name: string; parentId: string | null }>(all: T[], name: string): T | null {
  const raw = name.trim().toLowerCase();
  const exact = all.find((c) => c.name.toLowerCase() === raw);
  if (exact) return exact;
  const q = normCategory(name);
  if (!q) return null;
  const norm = all.find((c) => normCategory(c.name) === q);
  if (norm) return norm;
  const syn = SYNONYM_INDEX.get(q);
  const viaSyn = syn ? all.find((c) => c.name === syn) : undefined;
  if (viaSyn) return viaSyn;
  const partial = all.filter((c) => {
    const n = normCategory(c.name);
    return ` ${n} `.includes(` ${q} `) || ` ${q} `.includes(` ${n} `);
  });
  if (partial.length === 1) return partial[0];
  // "Food" matches the parent and nothing else specific: prefer the one parent among the matches.
  const parents = partial.filter((c) => !c.parentId);
  return parents.length === 1 && partial.every((c) => c === parents[0] || c.parentId === parents[0].id) ? parents[0] : null;
}

/** Resolves a category by name (forgiving about case, plurals, "&" and everyday words). Returns it and all its descendants' ids. */
export async function resolveCategory(scope: UserScope, name: string) {
  const all = await listCategories(scope);
  const target = matchCategory(all, name);
  if (!target) return null;
  const ids = new Set([target.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return { category: target, ids: [...ids] };
}

export async function getCategoryByName({ tx, userId }: UserScope, name: string) {
  const [row] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, name)));
  return row ?? null;
}
