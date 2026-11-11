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
import { cleanVendorName } from "@/lib/vendor";
import { ACCENT_FROM, ACCENT_TO, IGNORED_MARKS, P2P_NEEDLES, parseSearch, prefilterNeedles, scoreRow } from "@/lib/txn-search";
import { getDb } from "../../db/client";
import { recordError } from "../error-reports";
import { autoCategorize, learnCategoryRule } from "./categorize";
import { parsePatch } from "../patch";

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
  // A plain vendor name, when the bank's line had noise (the raw line stays in description).
  const tidy = cleanVendorName(d.merchantName || d.description);
  if (tidy && tidy !== d.description.trim()) d.merchantName = tidy;
  let catKind: "expense" | "income" | "transfer" | null = null;
  if (!d.categoryId && !d.kind) {
    // Learned rules first, then well-known merchants; otherwise left uncategorized.
    const auto = await autoCategorize(scope, { merchantName: d.merchantName, description: d.description, amountCents: d.amountCents });
    if (auto) {
      d.categoryId = auto.categoryId;
      d.kind = auto.kind;
    }
  }
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

/**
 * Updates a transaction. With `learn`, a changed category becomes a rule for
 * that merchant (future transactions follow it), and the result says how many
 * past transactions from the merchant could be updated too.
 */
export async function updateTransaction(scope: UserScope, id: string, patch: z.input<typeof transactionPatchSchema>, opts: { learn?: boolean } = {}) {
  const d = parsePatch(transactionPatchSchema, patch);
  await assertOwned(scope, categories, d.categoryId, "Category");
  const [before] = opts.learn
    ? await scope.tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, scope.userId)))
    : [];
  const [row] = await scope.tx
    .update(transactions)
    .set(d)
    .where(and(eq(transactions.id, id), eq(transactions.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Transaction");
  if (opts.learn && before && d.categoryId && d.categoryId !== before.categoryId) {
    const learned = await learnCategoryRule(scope, row, d.categoryId, d.kind);
    return Object.assign(row, { learnedRule: learned && { id: learned.rule.id, merchant: learned.rule.label, othersToUpdate: learned.othersToUpdate } });
  }
  return Object.assign(row, { learnedRule: null as null | { id: string; merchant: string; othersToUpdate: number } });
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
  /**
   * Forgiving by default: every meaningful word must match somewhere (description, merchant or notes),
   * in any order; payment-app words are hints; truncated names match. See lib/txn-search.ts.
   */
  search?: string;
  /** Match `search` as one exact case-insensitive phrase instead (the old behaviour). */
  phrase?: boolean;
  /** Forgiving search, but keep only rows where every word matched as the same word (no shortened names, initials or typos). For totals. */
  sureOnly?: boolean;
  minAmountCents?: number;
  maxAmountCents?: number;
  includeExcluded?: boolean;
  limit?: number;
};

const likeEscape = (s: string) => s.replace(/[\\%_]/g, "");
export const anyTextLike = (needle: string) => {
  const p = `%${likeEscape(needle)}%`;
  return or(ilike(transactions.description, p), ilike(transactions.merchantName, p), ilike(transactions.notes, p))!;
};

/** Accent- and apostrophe-blind containment, like the matcher in code (stored text is not folded). */
const foldedLike = (needle: string) => {
  const p = `%${likeEscape(needle)}%`;
  const fold = (col: typeof transactions.description | typeof transactions.merchantName | typeof transactions.notes) =>
    sql`translate(translate(lower(coalesce(${col}, '')), ${IGNORED_MARKS}, ''), ${ACCENT_FROM}, ${ACCENT_TO}) like ${p}`;
  return or(fold(transactions.description), fold(transactions.merchantName), fold(transactions.notes))!;
};

/** The forgiving search reads candidates in pages of this size, up to a hard cap, until it has enough matches. */
export const SEARCH_PAGE = 1000;
const SEARCH_SCAN_CAP = 20000;
/** Person-to-person lookups only look this far back. */
const P2P_LOOKBACK = sql`(current_date - interval '2 years')`;

async function selectPage(scope: UserScope, conds: ReturnType<typeof eq>[], limit: number, after?: { date: string; createdAt: string; id: string }) {
  const rows = await scope.tx
    .select({
      t: transactions,
      accountName: financialAccounts.name,
      accountSource: financialAccounts.source,
      // Recurring detection tells a transfer between the user's own accounts from a payment to someone else by these.
      accountType: financialAccounts.type,
      accountMask: financialAccounts.mask,
      categoryName: categories.name,
      categoryColor: categories.color,
      // Full-precision text for the paging cursor (a JS Date would cut the microseconds).
      createdAtRaw: sql<string>`${transactions.createdAt}::text`,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        ...conds,
        after
          ? sql`(${transactions.date}, ${transactions.createdAt}, ${transactions.id}) < (${after.date}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit);
  const mapped = rows.map((r) => ({
    ...r.t,
    /** false only for forgiving-search rows that matched through a shortened name, an initial or a typo. */
    sure: true,
    accountName: r.accountName,
    accountSource: r.accountSource,
    accountType: r.accountType,
    accountMask: r.accountMask,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
  }));
  const last = rows[rows.length - 1];
  return { rows: mapped, last: last ? { date: last.t.date, createdAt: last.createdAtRaw, id: last.t.id } : undefined };
}

async function selectRows(scope: UserScope, conds: ReturnType<typeof eq>[], limit: number) {
  return (await selectPage(scope, conds, limit)).rows;
}

/** Every filter except the text search. */
export async function baseConds(scope: UserScope, q: TransactionQuery) {
  const conds = [eq(transactions.userId, scope.userId)] as ReturnType<typeof eq>[];
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
  if (q.minAmountCents != null) conds.push(sql`abs(${transactions.amountCents}) >= ${q.minAmountCents}`);
  if (q.maxAmountCents != null) conds.push(sql`abs(${transactions.amountCents}) <= ${q.maxAmountCents}`);
  return conds;
}

export async function queryTransactions(scope: UserScope, q: TransactionQuery = {}) {
  const conds = await baseConds(scope, q);
  const limit = Math.min(q.limit ?? 500, 5000);
  const search = q.search?.trim();
  if (!search) return selectRows(scope, conds, limit);
  if (q.phrase) {
    conds.push(anyTextLike(search));
    return selectRows(scope, conds, limit);
  }
  // Forgiving: narrow in SQL (newest first, accent-blind), then require every word in code, page by page.
  const parsed = parseSearch(search);
  if (parsed.phrase) {
    // Nothing usable as words (another alphabet, a lone letter): the raw text as one phrase. Never drop the filter.
    conds.push(anyTextLike(search));
    return selectRows(scope, conds, limit);
  }
  const { terms } = parsed;
  conds.push(or(...prefilterNeedles(terms).map(foldedLike))!);
  const out: Awaited<ReturnType<typeof selectRows>> = [];
  // Keyset paging (date, created, id) in the same newest-first order: a row inserted or removed between pages
  // (a sync) can't shift later pages, and the seen set means no row is ever counted twice.
  const seen = new Set<string>();
  let after: { date: string; createdAt: string; id: string } | undefined;
  for (let scanned = 0; scanned < SEARCH_SCAN_CAP && out.length < limit; scanned += SEARCH_PAGE) {
    const page = await selectPage(scope, conds, SEARCH_PAGE, after);
    for (const r of page.rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const m = scoreRow(terms, r);
      if (m.all && (m.sure || !q.sureOnly)) out.push({ ...r, sure: m.sure });
    }
    if (page.rows.length < SEARCH_PAGE || !page.last) break;
    after = page.last;
  }
  return out.slice(0, limit);
}

export type TransactionRow = Awaited<ReturnType<typeof queryTransactions>>[number];

/** Rows per page when a caller reads past the list cap (keyset order, so a sync between pages can't skip or repeat a row). */
export const ALL_PAGE = 2000;
/** The most rows an uncapped read returns; past it `truncated` is true. Sums should use totals.ts instead. */
export const ALL_MAX = 50_000;

export type PageCursor = { date: string; createdAt: string; id: string };

/**
 * One keyset page (newest first) of what a plain query matches; pass the previous page's `last` as `after`.
 * A text filter here is the plain substring match (the Transactions page box), never the forgiving one.
 */
export async function readTransactionPage(
  scope: UserScope,
  q: Omit<TransactionQuery, "search" | "phrase" | "sureOnly" | "limit"> & { search?: string },
  after?: PageCursor,
  pageSize = ALL_PAGE,
) {
  const conds = await baseConds(scope, q);
  if (q.search?.trim()) conds.push(anyTextLike(q.search.trim()));
  return selectPage(scope, conds, pageSize, after);
}

/**
 * Every matching row up to ALL_MAX, newest first (explicit, unlike the list default of 500). `truncated` says the
 * bound was hit. Prefer the SQL totals in totals.ts when only a sum or a group is needed. With a text search the
 * forgiving matcher's own scan limit still applies.
 */
export async function queryAllTransactions(
  scope: UserScope,
  q: Omit<TransactionQuery, "limit"> = {},
  opts: { max?: number } = {},
): Promise<TransactionRow[] & { truncated?: boolean }> {
  const max = opts.max ?? ALL_MAX;
  if (q.search?.trim()) return Object.assign(await queryTransactions(scope, { ...q, limit: 5000 }), { truncated: false });
  const conds = await baseConds(scope, q);
  let out: TransactionRow[] = [];
  let after: PageCursor | undefined;
  let truncated = false;
  for (;;) {
    const page = await selectPage(scope, conds, ALL_PAGE, after);
    out.push(...page.rows);
    // One row past the bound proves there is more; exactly `max` rows is not truncated.
    if (out.length > max) {
      out = out.slice(0, max);
      truncated = true;
      break;
    }
    if (page.rows.length < ALL_PAGE || !page.last) break;
    after = page.last;
  }
  if (truncated) {
    // Never silent: one scrubbed error with no user content (the owner's error alerts pick it up).
    await recordError(getDb(), {
      source: "server",
      route: "finance.read-all",
      message: `Transactions read truncated at ${max.toLocaleString("en-US")} rows`,
    }).catch(() => {});
  }
  return Object.assign(out, { truncated });
}

export type TransactionFind =
  | { match: "exact"; rows: TransactionRow[]; closest: [] }
  | { match: "similar"; rows: TransactionRow[]; closest: [] }
  | { match: "none"; rows: []; closest: TransactionRow[] };

/**
 * queryTransactions plus a helpful miss. No row matches every word: try a spelling-tolerant pass over
 * recent person-to-person payments (Zelle, Venmo, Cash App, PayPal), and if that finds nothing, return
 * the closest few of them so the caller can ask "is that who you meant?".
 */
export async function findTransactions(scope: UserScope, q: TransactionQuery = {}): Promise<TransactionFind> {
  const rows = await queryTransactions(scope, q);
  const search = q.search?.trim();
  if (rows.length) return { match: rows.some((r) => r.sure) ? "exact" : "similar", rows, closest: [] };
  if (!search || q.phrase) return { match: "exact", rows, closest: [] };

  const { terms, apps, phrase } = parseSearch(search);
  if (phrase) return { match: "none", rows: [], closest: [] };
  const conds = await baseConds(scope, q);
  conds.push(or(...P2P_NEEDLES.map(anyTextLike))!);
  if (!q.from) conds.push(gte(transactions.date, sql`${P2P_LOOKBACK}`));
  const recent = await selectRows(scope, conds, 1500);
  const scored = recent.map((r) => ({ r, ...scoreRow(terms, r, true) }));
  const limit = Math.min(q.limit ?? 5, 5);
  const similar = scored.filter((x) => x.all);
  if (similar.length) return { match: "similar", rows: similar.slice(0, Math.min(q.limit ?? 500, 20)).map((x) => ({ ...x.r, sure: false })), closest: [] };
  // Best partial matches first, then newest. Offer people-payments only when the person mentioned a payment app
  // or something partly matched: a missing "Starbucks" must not come back as Zelle lines.
  const partial = scored.some((x) => x.score > 0);
  if (!apps.length && !partial) return { match: "none", rows: [], closest: [] };
  const closest = scored
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .filter((x) => !partial || x.score > 0)
    .slice(0, limit)
    .map((x) => x.r);
  return { match: "none", rows: [], closest };
}

/** The first (oldest) expense date in each category, across all history: when a category started having data. */
export async function firstSpendDates(scope: UserScope, categoryIds: string[]): Promise<Map<string, string>> {
  if (!categoryIds.length) return new Map();
  const rows = await scope.tx
    .select({ categoryId: transactions.categoryId, first: sql<string>`min(${transactions.date})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, scope.userId),
        inArray(transactions.categoryId, categoryIds),
        eq(transactions.kind, "expense"),
        eq(transactions.excluded, false),
      ),
    )
    .groupBy(transactions.categoryId);
  return new Map(rows.filter((r) => r.categoryId).map((r) => [r.categoryId!, String(r.first)]));
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
