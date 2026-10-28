import { createHash } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, isValidDateStr } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeText } from "@/lib/utils";
import { categories, financialAccounts, transactions, type DataSource, type TransactionKind } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { assertOwned, notFound, ServiceError } from "../errors";
import { listCategories, resolveCategory } from "./categories";

export const TRANSACTION_KINDS = ["income", "expense", "transfer", "refund", "reimbursement", "investment", "adjustment"] as const;

export const transactionInputSchema = z.object({
  accountId: z.string().uuid(),
  date: z.string().regex(DATE_RE).refine(isValidDateStr, "Invalid date"),
  description: z.string().trim().min(1).max(300),
  merchantName: z.string().trim().max(200).nullish(),
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount cannot be zero"),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  categoryId: z.string().uuid().nullish(),
  pending: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
});

/** Picks a sensible kind from the amount sign and the category's kind. */
export function inferKind(amountCents: number, categoryKind: "expense" | "income" | "transfer" | null | undefined): TransactionKind {
  if (categoryKind === "transfer") return "transfer";
  if (categoryKind === "income") return amountCents >= 0 ? "income" : "expense";
  if (categoryKind === "expense") return amountCents < 0 ? "expense" : "refund";
  return amountCents < 0 ? "expense" : "income";
}

export async function createTransaction(
  scope: UserScope,
  input: z.input<typeof transactionInputSchema>,
  source: DataSource = "manual",
  providerTransactionId?: string,
) {
  const d = transactionInputSchema.parse(input);
  await assertOwned(scope, financialAccounts, d.accountId, "Account");
  let catKind: "expense" | "income" | "transfer" | null = null;
  if (d.categoryId) {
    const [c] = await scope.tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, d.categoryId), eq(categories.userId, scope.userId)));
    if (!c) throw notFound("Category");
    catKind = c.kind;
  }
  const [row] = await scope.tx
    .insert(transactions)
    .values({
      userId: scope.userId,
      accountId: d.accountId,
      date: d.date,
      description: d.description,
      merchantName: d.merchantName ?? null,
      amountCents: d.amountCents,
      kind: d.kind ?? inferKind(d.amountCents, catKind),
      categoryId: d.categoryId ?? null,
      pending: d.pending,
      notes: d.notes ?? null,
      source,
      providerTransactionId: providerTransactionId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export const transactionPatchSchema = z.object({
  kind: z.enum(TRANSACTION_KINDS).optional(),
  categoryId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
  excluded: z.boolean().optional(),
  merchantName: z.string().max(200).nullish(),
});

export async function updateTransaction(scope: UserScope, id: string, patch: z.input<typeof transactionPatchSchema>) {
  const d = transactionPatchSchema.parse(patch);
  await assertOwned(scope, categories, d.categoryId, "Category");
  const [row] = await scope.tx
    .update(transactions)
    .set(d)
    .where(and(eq(transactions.id, id), eq(transactions.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Transaction");
  return row;
}

export async function deleteTransaction(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, scope.userId), inArray(transactions.source, ["manual", "import", "jarvis"])))
    .returning({ id: transactions.id });
  if (!row) throw new ServiceError("Transaction not found, or it is synced from a provider and cannot be deleted.", "not_found");
  return row;
}

export type TransactionQuery = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryName?: string;
  categoryIds?: string[];
  kinds?: TransactionKind[];
  search?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  includeExcluded?: boolean;
  limit?: number;
};

export async function queryTransactions(scope: UserScope, q: TransactionQuery = {}) {
  const conds = [eq(transactions.userId, scope.userId)];
  if (q.from) conds.push(gte(transactions.date, q.from));
  if (q.to) conds.push(lte(transactions.date, q.to));
  if (q.accountId) conds.push(eq(transactions.accountId, q.accountId));
  let categoryIds = q.categoryIds;
  if (q.categoryName) {
    const resolved = await resolveCategory(scope, q.categoryName);
    if (!resolved) throw new ServiceError(`No category named "${q.categoryName}".`, "not_found");
    categoryIds = resolved.ids;
  }
  if (categoryIds) conds.push(categoryIds.length ? inArray(transactions.categoryId, categoryIds) : sql`false`);
  if (q.kinds?.length) conds.push(inArray(transactions.kind, q.kinds));
  if (!q.includeExcluded) conds.push(eq(transactions.excluded, false));
  if (q.search) {
    const s = `%${q.search.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(transactions.description, s), ilike(transactions.merchantName, s), ilike(transactions.notes, s))!);
  }
  if (q.minAmountCents != null) conds.push(sql`abs(${transactions.amountCents}) >= ${q.minAmountCents}`);
  if (q.maxAmountCents != null) conds.push(sql`abs(${transactions.amountCents}) <= ${q.maxAmountCents}`);
  const rows = await scope.tx
    .select({
      t: transactions,
      accountName: financialAccounts.name,
      accountSource: financialAccounts.source,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(Math.min(q.limit ?? 500, 5000));
  return rows.map((r) => ({
    ...r.t,
    accountName: r.accountName,
    accountSource: r.accountSource,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
  }));
}

// ---------------------------------------------------------------- CSV import / export

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (isValidDateStr(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // US M/D/YYYY
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return isValidDateStr(d) ? d : null;
  }
  return null;
}

export type CsvImportResult = { imported: number; duplicates: number; errors: { line: number; error: string }[] };

/**
 * Imports a bank CSV into one account. Required columns: date, description,
 * amount (negative = money out). Optional: category, merchant.
 * Re-importing the same file is idempotent.
 */
export async function importTransactionsCsv(scope: UserScope, accountId: string, csv: string): Promise<CsvImportResult> {
  await assertOwned(scope, financialAccounts, accountId, "Account");
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new ServiceError("The CSV has no data rows.");
  const header = rows[0].map((h) => normalizeText(h));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col("date", "transaction date", "posted date");
  const iDesc = col("description", "name", "memo", "payee");
  const iAmt = col("amount", "amount usd");
  const iCat = col("category");
  const iMerchant = col("merchant", "merchant name");
  if (iDate < 0 || iDesc < 0 || iAmt < 0) throw new ServiceError("CSV needs date, description and amount columns.");
  const cats = await listCategories(scope);
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const seen = new Map<string, number>();
  const result: CsvImportResult = { imported: 0, duplicates: 0, errors: [] };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] ?? "");
    const amount = parseMoneyToCents(r[iAmt] ?? "");
    const description = (r[iDesc] ?? "").trim();
    if (!date || amount == null || amount === 0 || !description) {
      result.errors.push({ line: i + 1, error: "Missing or invalid date, amount or description" });
      continue;
    }
    const base = `${accountId}|${date}|${amount}|${normalizeText(description)}`;
    const n = (seen.get(base) ?? 0) + 1; // identical rows on the same day are distinct purchases
    seen.set(base, n);
    const id = `import:${createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 32)}`;
    const cat = iCat >= 0 ? catByName.get((r[iCat] ?? "").trim().toLowerCase()) : undefined;
    const row = await createTransaction(
      scope,
      { accountId, date, description, amountCents: amount, categoryId: cat?.id ?? null, merchantName: iMerchant >= 0 ? r[iMerchant] || null : null },
      "import",
      id,
    );
    if (row) result.imported++;
    else result.duplicates++;
  }
  return result;
}
