import { and, asc, eq } from "drizzle-orm";
import { categories } from "../../db/schema";
import type { UserScope } from "../../db/with-user";

type Seed = { name: string; kind: "expense" | "income" | "transfer"; color: string; children?: string[] };

export const DEFAULT_CATEGORIES: Seed[] = [
  { name: "Food & Dining", kind: "expense", color: "#d97706", children: ["Groceries", "Restaurants", "Coffee", "Food Delivery"] },
  { name: "Housing", kind: "expense", color: "#7c3aed", children: ["Rent", "Utilities", "Internet"] },
  { name: "Transportation", kind: "expense", color: "#0891b2", children: ["Gas", "Rideshare", "Public Transit", "Parking"] },
  { name: "Shopping", kind: "expense", color: "#db2777", children: ["Clothing", "Electronics", "Household"] },
  { name: "Entertainment", kind: "expense", color: "#ea580c", children: ["Streaming", "Events", "Games"] },
  { name: "Health", kind: "expense", color: "#059669", children: ["Pharmacy", "Fitness", "Medical"] },
  { name: "Education", kind: "expense", color: "#2563eb", children: ["Tuition", "Books & Supplies"] },
  { name: "Bills & Subscriptions", kind: "expense", color: "#4f46e5", children: ["Phone", "Insurance", "Software"] },
  { name: "Personal Care", kind: "expense", color: "#c026d3" },
  { name: "Travel", kind: "expense", color: "#0d9488" },
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

export async function listCategories({ tx, userId }: UserScope) {
  return tx.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name));
}

/** Resolves a category by case-insensitive name. Returns the category and all of its descendants' ids. */
export async function resolveCategory(scope: UserScope, name: string) {
  const all = await listCategories(scope);
  const target = all.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
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
  const [row] = await tx.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.name, name)));
  return row ?? null;
}
