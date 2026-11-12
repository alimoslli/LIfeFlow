import { createHash, createPublicKey, verify as verifySig, type JsonWebKey } from "node:crypto";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { decryptSecret, encryptSecret } from "../crypto";
import {
  connectionRegistry,
  financialAccounts,
  holdings,
  integrations,
  syncJobs,
  transactions,
  users,
  type AccountType,
  type TransactionKind,
} from "../db/schema";
import type { Database } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { cleanVendorName } from "@/lib/vendor";
import { fetchWithTimeout } from "./timeout";
import { tidyForUser } from "../services/finance/tidy";
import { categoryIdByName, keywordCategory, ruleFor } from "../services/finance/categorize";
import { recordNetWorth } from "../services/finance/investing";

/**
 * Plaid: read-only bank, card, loan and investment data.
 *
 * - The user signs in to their bank inside Plaid Link; LifeFlow never sees
 *   bank credentials. We store only Plaid's access token, AES-GCM encrypted.
 * - Products: transactions only. Investments and liabilities are deliberately
 *   not requested during the basic bank-link flow because Plaid rejects the
 *   entire Link token when an account has not been approved for either add-on.
 *   Nothing here can move money.
 * - REST via fetch with an injectable `f`, so tests run against a fake Plaid.
 */

export type Fetch = typeof fetch;

export class PlaidError extends Error {
  constructor(
    message: string,
    public code: string | null = null,
    public reauth = false,
  ) {
    super(message);
  }
}

export function plaidConfig(env: Record<string, string | undefined> = process.env) {
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  if (!clientId || !secret) return null;
  const plaidEnv = env.PLAID_ENV?.trim() === "production" ? "production" : "sandbox";
  const appUrl = env.APP_URL?.trim().replace(/\/$/, "") || null;
  return {
    clientId,
    secret,
    env: plaidEnv as "sandbox" | "production",
    baseUrl: `https://${plaidEnv}.plaid.com`,
    webhookUrl: appUrl ? `${appUrl}/api/integrations/plaid/webhook` : null,
    redirectUri: env.PLAID_REDIRECT_URI?.trim() || null,
  };
}

/** What the person (and the skyling) is told when a bank request fails for a reason they can't fix. */
export const BANK_UNAVAILABLE = "The bank connection isn't available right now. Please try again later.";

const REAUTH = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ACCESS_NOT_GRANTED", "INVALID_ACCESS_TOKEN"]);

async function call<T>(path: string, body: Record<string, unknown>, f: Fetch = fetch): Promise<T> {
  const cfg = plaidConfig();
  if (!cfg) throw new PlaidError("Bank connections aren't available yet.", "NOT_CONFIGURED");
  let res: Response;
  try {
    res = await fetchWithTimeout(f, `${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...body }),
    });
  } catch {
    throw new PlaidError("Couldn't reach Plaid. Please try again in a moment.", "NETWORK");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error_code === "string" ? json.error_code : null;
    // Plaid's own error details (never the request body, which holds the secret), so setup problems show in the server logs.
    console.error("[plaid]", path, res.status, json.error_type, code, json.error_message, json.request_id);
    // Plaid's display_message is written for the person; anything else (wrong keys, a bad field) is ours to fix, so the
    // person and the skyling only hear that the connection isn't available. Never name settings or codes to them.
    const displayMessage = typeof json.display_message === "string" ? json.display_message : "";
    const msg = displayMessage || BANK_UNAVAILABLE;
    throw new PlaidError(code && REAUTH.has(code) ? "Your bank needs you to sign in again. Use Reconnect." : msg, code, !!code && REAUTH.has(code));
  }
  return json as T;
}

// ------------------------------------------------------------ connect

export async function createLinkToken(userId: string, opts: { accessToken?: string; accountSelection?: boolean } = {}, f?: Fetch) {
  const cfg = plaidConfig();
  const r = await call<{ link_token: string; expiration: string }>(
    "/link/token/create",
    {
      client_name: "LifeFlow",
      user: { client_user_id: userId },
      country_codes: ["US"],
      language: "en",
      ...(opts.accessToken
        ? // Update mode: sign in again, or (accountSelection) change which accounts the bank shares.
          { access_token: opts.accessToken, ...(opts.accountSelection && { update: { account_selection_enabled: true } }) }
        : { products: ["transactions"], transactions: { days_requested: 730 } }),
      ...(cfg?.webhookUrl && { webhook: cfg.webhookUrl }),
      ...(cfg?.redirectUri && { redirect_uri: cfg.redirectUri }),
    },
    f,
  );
  return { linkToken: r.link_token, expiration: r.expiration };
}

type Creds = { accessToken: string; cursor: string | null };

const readCreds = (row: { encryptedCredentials: string | null }): Creds => {
  if (!row.encryptedCredentials) throw new PlaidError("This bank connection is missing its credentials. Remove it and connect again.", null, true);
  return JSON.parse(decryptSecret(row.encryptedCredentials)) as Creds;
};

/** Exchanges Link's one-time public token and saves the connection. */
export async function exchangePublicToken(scope: UserScope, publicToken: string, institutionName: string | null, f?: Fetch) {
  const r = await call<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken }, f);
  const name = (institutionName ?? "").replace(/[^\p{L}\p{N} &.,'()-]/gu, "").slice(0, 80) || "Bank";
  const [row] = await scope.tx
    .insert(integrations)
    .values({
      userId: scope.userId,
      provider: "plaid",
      externalId: r.item_id,
      status: "connected",
      displayName: name,
      encryptedCredentials: encryptSecret(JSON.stringify({ accessToken: r.access_token, cursor: null } satisfies Creds)),
      scopes: ["transactions", "investments", "liabilities"],
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider, integrations.externalId],
      set: {
        status: "connected",
        lastError: null,
        encryptedCredentials: encryptSecret(JSON.stringify({ accessToken: r.access_token, cursor: null })),
        displayName: name,
      },
    })
    .returning();
  await scope.tx
    .insert(connectionRegistry)
    .values({ userId: scope.userId, provider: "plaid", integrationId: row.id, externalId: r.item_id })
    .onConflictDoNothing();
  return row;
}

export async function listPlaidConnections(scope: UserScope) {
  const rows = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, scope.userId), eq(integrations.provider, "plaid")));
  return rows.map(({ encryptedCredentials: _c, ...r }) => r);
}

/** Link token for an existing connection: sign in again, or choose which accounts it shares. */
export async function reconnectLinkToken(scope: UserScope, integrationId: string, f?: Fetch, opts: { accountSelection?: boolean } = {}) {
  const row = await getItem(scope, integrationId);
  if (opts.accountSelection)
    await scope.tx
      .update(integrations)
      .set({ metadata: sql`${integrations.metadata} - 'newAccountsAvailableAt'` })
      .where(eq(integrations.id, row.id));
  return createLinkToken(scope.userId, { accessToken: readCreds(row).accessToken, accountSelection: opts.accountSelection }, f);
}

/**
 * Turns one bank account on or off in LifeFlow. Off: it's hidden everywhere, its synced
 * transactions and holdings are removed, and later syncs keep it off. On again: the next
 * sync re-imports it from the start (the connection's cursor is reset).
 */
export async function setPlaidAccountIncluded(scope: UserScope, accountId: string, include: boolean) {
  const [acc] = await scope.tx
    .select({ id: financialAccounts.id, integrationId: financialAccounts.integrationId, name: financialAccounts.name })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.userId, scope.userId), eq(financialAccounts.source, "plaid")));
  if (!acc?.integrationId) throw new PlaidError("That bank account wasn't found.", "NOT_FOUND");
  if (include) {
    await scope.tx.update(financialAccounts).set({ excludedAt: null, archivedAt: null }).where(eq(financialAccounts.id, acc.id));
    const item = await getItem(scope, acc.integrationId);
    const creds = readCreds(item);
    await scope.tx
      .update(integrations)
      .set({ encryptedCredentials: encryptSecret(JSON.stringify({ ...creds, cursor: null } satisfies Creds)) })
      .where(eq(integrations.id, item.id));
  } else {
    const now = new Date();
    await scope.tx.update(financialAccounts).set({ excludedAt: now, archivedAt: now }).where(eq(financialAccounts.id, acc.id));
    await removeSyncedData(scope, [acc.id]);
  }
  return { id: acc.id, name: acc.name, integrationId: acc.integrationId };
}

/** Deletes the synced transactions and holdings of these accounts (bank data only; nothing the user typed in). */
async function removeSyncedData(scope: UserScope, accountIds: string[]) {
  if (!accountIds.length) return;
  await scope.tx
    .delete(transactions)
    .where(and(eq(transactions.userId, scope.userId), eq(transactions.source, "plaid"), inArray(transactions.accountId, accountIds)));
  await scope.tx.delete(holdings).where(and(eq(holdings.userId, scope.userId), eq(holdings.source, "plaid"), inArray(holdings.accountId, accountIds)));
}

async function getItem(scope: UserScope, integrationId: string) {
  const [row] = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId), eq(integrations.provider, "plaid")));
  if (!row) throw new PlaidError("Bank connection not found.", "NOT_FOUND");
  return row;
}

/** True when this user owns that Plaid connection (checked inside withUser, like syncConnection). */
export async function ownsPlaidConnection(userId: string, integrationId: string) {
  return withUser(userId, (s) =>
    getItem(s, integrationId).then(
      () => true,
      (e) => (e instanceof PlaidError && e.code === "NOT_FOUND" ? false : Promise.reject(e)),
    ),
  );
}

// ------------------------------------------------------------ mapping (pure)

type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null; limit: number | null; iso_currency_code: string | null };
};

const TYPE: Record<string, AccountType> = {
  depository: "depository",
  credit: "credit",
  loan: "loan",
  investment: "investment",
  brokerage: "investment",
  other: "other",
};
const cents = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

export function mapAccount(a: PlaidAccount) {
  const type = TYPE[a.type] ?? "other";
  return {
    name: a.name.slice(0, 120),
    officialName: a.official_name?.slice(0, 200) ?? null,
    type,
    subtype: a.subtype,
    mask: a.mask,
    // Plaid reports what's owed on cards and loans as a positive current balance, matching our convention.
    currentBalanceCents: cents(a.balances.current) ?? 0,
    availableBalanceCents: cents(a.balances.available),
    creditLimitCents: cents(a.balances.limit),
    currency: a.balances.iso_currency_code ?? "USD",
  };
}

type PlaidTxn = {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  /** When it happened, to the minute (ISO 8601), only from banks that say; often null. */
  authorized_datetime?: string | null;
  datetime?: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  pending_transaction_id: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
};

/** When the purchase happened, from the bank's own time (authorized first, then posted); null when it doesn't say. Never guessed. */
export function purchaseTime(t: Pick<PlaidTxn, "authorized_datetime" | "datetime">): Date | null {
  const raw = t.authorized_datetime ?? t.datetime;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Plaid's categories → LifeFlow's default category names and transaction kinds. */
/** Money coming in that's really income: payroll and peer payments, which banks often report as transfers. */
const INCOMING_HINT = /\b(payroll|direct dep|dir dep|deposit|salary|zelle|venmo|cash ?app|paypal|wages|stipend)\b/i;

export function mapPfc(pfc: PlaidTxn["personal_finance_category"], amountCents: number, text = ""): { category: string | null; kind: TransactionKind } {
  const p = pfc?.primary ?? "";
  const d = pfc?.detailed ?? "";
  const out = amountCents < 0;
  if (p === "INCOME")
    return { category: d.includes("WAGES") ? "Paycheck" : d.includes("INTEREST") ? "Interest Income" : "Side Income", kind: out ? "expense" : "income" };
  if (p === "TRANSFER_IN" || p === "TRANSFER_OUT") {
    if (d.includes("SAVINGS")) return { category: "Savings Transfer", kind: "transfer" };
    if (d.includes("INVESTMENT")) return { category: "Investment Transfer", kind: "transfer" };
    // A deposit from payroll or a friend is income; moving your own money between accounts is not.
    if (p === "TRANSFER_IN" && !out && INCOMING_HINT.test(text)) return { category: d.includes("PAYROLL") ? "Paycheck" : "Side Income", kind: "income" };
    return { category: null, kind: "transfer" };
  }
  if (p === "LOAN_PAYMENTS") return { category: d.includes("CREDIT_CARD") ? "Credit Card Payment" : null, kind: "transfer" };
  const map: Record<string, (det: string) => string> = {
    BANK_FEES: () => "Fees & Interest",
    ENTERTAINMENT: (x) =>
      x.includes("TV_AND_MOVIES") || x.includes("MUSIC")
        ? "Streaming"
        : x.includes("VIDEO_GAMES")
          ? "Games"
          : x.includes("AMUSEMENT") || x.includes("MUSEUM")
            ? "Activities"
            : x.includes("SPORTING_EVENTS")
              ? "Sports"
              : "Events",
    FOOD_AND_DRINK: (x) =>
      x.includes("GROCERIES") ? "Groceries" : x.includes("COFFEE") ? "Coffee" : x.includes("BEER_WINE") ? "Bars & Alcohol" : "Restaurants",
    GENERAL_MERCHANDISE: (x) =>
      x.includes("CLOTHING")
        ? "Clothing"
        : x.includes("ELECTRONICS")
          ? "Electronics"
          : x.includes("ONLINE_MARKETPLACES")
            ? "Online Shopping"
            : x.includes("PET_SUPPLIES")
              ? "Pets"
              : "Household",
    HOME_IMPROVEMENT: () => "Household",
    MEDICAL: (x) =>
      x.includes("PHARMAC")
        ? "Pharmacy"
        : x.includes("VETERINARY")
          ? "Pets"
          : x.includes("DENTAL") || x.includes("EYE_CARE")
            ? "Dental & Vision"
            : x.includes("MENTAL")
              ? "Mental Health"
              : "Medical",
    PERSONAL_CARE: (x) => (x.includes("GYMS") ? "Fitness" : "Personal Care"),
    GENERAL_SERVICES: (x) =>
      x.includes("INSURANCE") ? "Insurance" : x.includes("EDUCATION") ? "Tuition" : x.includes("AUTOMOTIVE") ? "Car Maintenance" : "Other",
    GOVERNMENT_AND_NON_PROFIT: (x) => (x.includes("DONATIONS") ? "Gifts & Donations" : "Other"),
    TRANSPORTATION: (x) =>
      x.includes("GAS")
        ? "Gas"
        : x.includes("PARKING")
          ? "Parking"
          : x.includes("PUBLIC_TRANSIT")
            ? "Public Transit"
            : x.includes("TAXIS")
              ? "Rideshare"
              : "Transportation",
    TRAVEL: (x) => (x.includes("FLIGHTS") ? "Flights" : x.includes("LODGING") ? "Hotels & Lodging" : "Travel"),
    // Every detailed code starts with RENT_AND_UTILITIES_, so match the suffix (includes("RENT") filed them all as Rent).
    RENT_AND_UTILITIES: (x) => (x.endsWith("_RENT") ? "Rent" : x.includes("TELEPHONE") ? "Phone" : x.includes("INTERNET") ? "Internet" : "Utilities"),
  };
  const fn = map[p];
  return { category: fn ? fn(d) : null, kind: out ? "expense" : "refund" };
}

/** Plaid's vague buckets; a specific merchant match (ChatGPT → Software, Prime → Subscriptions) is better. */
const GENERIC = new Set(["Other", "Household", "Events", "Transportation", "Personal Care"]);

/** Plaid's category, unless it's vague and the statement line names something specific of the same direction (spending vs income). */
export function pickCategory(pfc: { category: string | null; kind: TransactionKind }, keyword: string | null) {
  if (!pfc.category) return keyword;
  if (keyword && pfc.kind === "expense" && GENERIC.has(pfc.category)) return keyword;
  return pfc.category;
}

// ------------------------------------------------------------ sync

export type SyncResult = { accounts: number; added: number; modified: number; removed: number; holdings: number; liabilities: number };

/** Pulls balances, new/changed/removed transactions, holdings and debt details for one connection. */
/** `live`: ask the bank for current balances now (a "Sync now" tap), instead of Plaid's last saved copy. */
export async function syncItem(scope: UserScope, integrationId: string, tz: string, f?: Fetch, opts: { live?: boolean } = {}): Promise<SyncResult> {
  // an account locked under 13 keeps nothing (services/onboarding.ts): a sync never writes for it. Read FOR SHARE so a
  // lock that starts meanwhile waits for this sync and then empties what it wrote, and one already made stops it here.
  const [me] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId)).for("share");
  if (me?.preferences.ageBlockedAt) throw new PlaidError("This account is locked.", "LOCKED");
  const item = await getItem(scope, integrationId);
  const creds = readCreds(item);
  const started = new Date();
  const result = await runSync(scope, item.id, creds, f, opts);
  await scope.tx
    .update(integrations)
    .set({
      status: "connected",
      lastError: null,
      metadata: sql`${integrations.metadata} - 'pendingExpiration'`,
      lastSyncedAt: new Date(),
      encryptedCredentials: encryptSecret(JSON.stringify(result.creds)),
    })
    .where(eq(integrations.id, item.id));
  await scope.tx
    .insert(syncJobs)
    .values({ userId: scope.userId, integrationId, kind: "plaid.sync", status: "succeeded", startedAt: started, finishedAt: new Date(), stats: result.stats });
  await recordNetWorth(scope, todayIn(tz));
  // Plain vendor names and categories for what just arrived. Never lets a tidy-up problem fail the sync.
  await tidyForUser(scope, "plaid_sync").catch((e) => console.error("[tidy]", e instanceof Error ? e.name : e));
  return result.stats;
}

/**
 * Syncs in its own transaction. If it fails, the failure is recorded in a
 * separate transaction (the sync's own writes roll back), so the user sees
 * what went wrong and whether they need to reconnect.
 */
export async function syncConnection(userId: string, integrationId: string, tz: string, f?: Fetch, opts: { live?: boolean } = {}) {
  try {
    return await withUser(userId, (s) => syncItem(s, integrationId, tz, f, opts));
  } catch (e) {
    // a locked account keeps nothing, not even a failed sync's note
    if (e instanceof PlaidError && e.code === "LOCKED") return null;
    const msg = e instanceof PlaidError ? e.message : "Sync failed. Please try again.";
    await withUser(userId, async (s) => {
      await s.tx
        .update(integrations)
        .set({
          ...(e instanceof PlaidError && e.reauth && { status: "error" as const, metadata: sql`${integrations.metadata} - 'pendingExpiration'` }),
          lastError: msg,
        })
        .where(and(eq(integrations.id, integrationId), eq(integrations.userId, userId)));
      await s.tx.insert(syncJobs).values({ userId, integrationId, kind: "plaid.sync", status: "failed", finishedAt: new Date(), error: msg });
    }).catch(() => undefined);
    throw e;
  }
}

async function runSync(scope: UserScope, integrationId: string, creds: Creds, f?: Fetch, opts: { live?: boolean } = {}) {
  const stats: SyncResult = { accounts: 0, added: 0, modified: 0, removed: 0, holdings: 0, liabilities: 0 };
  const token = creds.accessToken;

  // 1. Accounts and balances. /accounts/get is Plaid's last saved copy; a "Sync now" asks the bank for live
  // balances (/accounts/balance/get), falling back to the saved copy if that isn't available.
  let acc: { accounts: PlaidAccount[] };
  try {
    acc = opts.live
      ? await call<{ accounts: PlaidAccount[] }>("/accounts/balance/get", { access_token: token }, f)
      : await call<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: token }, f);
  } catch (e) {
    if (!opts.live || !(e instanceof PlaidError) || e.reauth) throw e;
    acc = await call<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: token }, f);
  }
  // Only accounts the user keeps on get transactions and holdings.
  const idByPlaid = new Map<string, string>();
  const seen: string[] = [];
  // Accounts the bank had stopped sharing: if one comes back, its history was removed here, so the cursor starts over.
  const wasUnshared = new Set(
    (
      await scope.tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.userId, scope.userId),
            eq(financialAccounts.integrationId, integrationId),
            eq(financialAccounts.source, "plaid"),
            sql`${financialAccounts.archivedAt} is not null and ${financialAccounts.excludedAt} is null`,
          ),
        )
    ).map((r) => r.id),
  );
  let restart = false;
  for (const a of acc.accounts) {
    const m = mapAccount(a);
    const [row] = await scope.tx
      .insert(financialAccounts)
      .values({ ...m, userId: scope.userId, integrationId, source: "plaid", providerAccountId: a.account_id, balanceUpdatedAt: new Date() })
      .onConflictDoUpdate({
        target: [financialAccounts.userId, financialAccounts.source, financialAccounts.providerAccountId],
        targetWhere: sql`provider_account_id is not null`,
        // An account the user turned off stays off (archived while excluded).
        set: { ...m, integrationId, balanceUpdatedAt: new Date(), archivedAt: sql`${financialAccounts.excludedAt}` },
      })
      .returning({ id: financialAccounts.id, excludedAt: financialAccounts.excludedAt });
    seen.push(row.id);
    if (row.excludedAt) continue;
    if (wasUnshared.has(row.id)) restart = true;
    idByPlaid.set(a.account_id, row.id);
    stats.accounts++;
  }
  // Accounts the bank no longer shares (changed in "Choose accounts"): hidden, and their bank data removed.
  if (acc.accounts.length) {
    const gone = await scope.tx
      .update(financialAccounts)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(financialAccounts.userId, scope.userId),
          eq(financialAccounts.integrationId, integrationId),
          eq(financialAccounts.source, "plaid"),
          isNull(financialAccounts.archivedAt),
          notInArray(financialAccounts.id, seen),
        ),
      )
      .returning({ id: financialAccounts.id });
    await removeSyncedData(
      scope,
      gone.map((g) => g.id),
    );
  }

  // 2. Transactions (cursor-based: only what changed since last time)
  let cursor = restart ? null : creds.cursor;
  for (let page = 0; page < 50; page++) {
    const r = await call<{ added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>(
      "/transactions/sync",
      { access_token: token, count: 500, ...(cursor && { cursor }) },
      f,
    );
    for (const t of [...r.added, ...r.modified]) {
      const accountId = idByPlaid.get(t.account_id);
      if (!accountId) continue;
      const amountCents = -Math.round(t.amount * 100); // Plaid: positive = money out
      const description = t.name.slice(0, 300);
      const rawMerchant = t.merchant_name?.slice(0, 200) ?? null;
      const tidyName = cleanVendorName(rawMerchant || description);
      // Show a plain name; the bank's own line stays in description.
      const merchantName = tidyName && tidyName !== description.trim() ? tidyName : rawMerchant;
      const rule = await ruleFor(scope, { merchantName, description });
      const pfc = mapPfc(t.personal_finance_category, amountCents, `${merchantName ?? ""} ${description}`);
      const categoryName = pickCategory(pfc, keywordCategory({ merchantName, description }, amountCents));
      const cat = rule ? null : categoryName ? await categoryIdByName(scope, categoryName) : null;
      const values = {
        accountId,
        date: t.date,
        authorizedDate: t.authorized_date,
        authorizedAt: purchaseTime(t),
        description,
        merchantName,
        amountCents,
        currency: t.iso_currency_code ?? "USD",
        kind: rule?.kind ?? pfc.kind,
        categoryId: rule?.categoryId ?? cat?.id ?? null,
        pending: t.pending,
        pendingTransactionId: t.pending_transaction_id,
      };
      const [existing] = await scope.tx
        .select({
          id: transactions.id,
          categoryId: transactions.categoryId,
          kind: transactions.kind,
          notes: transactions.notes,
          merchantName: transactions.merchantName,
          authorizedAt: transactions.authorizedAt,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, scope.userId), eq(transactions.providerTransactionId, t.transaction_id)));
      if (existing) {
        // Keep the user's own category choice and notes; refresh everything else from the bank.
        await scope.tx
          .update(transactions)
          .set({
            ...values,
            // Keep a name the user (or a tidy-up) already chose; refresh the rest from the bank.
            merchantName: existing.merchantName ?? values.merchantName,
            // a time the bank gave once stays, if a later update leaves it out
            authorizedAt: values.authorizedAt ?? existing.authorizedAt,
            categoryId: existing.categoryId ?? values.categoryId,
            kind: existing.categoryId ? existing.kind : values.kind,
          })
          .where(eq(transactions.id, existing.id));
        stats.modified++;
      } else {
        await scope.tx.insert(transactions).values({ ...values, userId: scope.userId, source: "plaid", providerTransactionId: t.transaction_id });
        stats.added++;
      }
      // A posted transaction replaces its pending version.
      if (t.pending_transaction_id)
        await scope.tx.delete(transactions).where(and(eq(transactions.userId, scope.userId), eq(transactions.providerTransactionId, t.pending_transaction_id)));
    }
    if (r.removed.length) {
      const del = await scope.tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.userId, scope.userId),
            inArray(
              transactions.providerTransactionId,
              r.removed.map((x) => x.transaction_id),
            ),
          ),
        )
        .returning({ id: transactions.id });
      stats.removed += del.length;
    }
    cursor = r.next_cursor;
    if (!r.has_more) break;
  }

  // 3 and 4 are optional products. Only asked for when the bank has those accounts (asking can add a paid
  // product to the connection), and a problem with them never throws away the rest of the sync.
  const kinds = new Set(acc.accounts.map((a) => TYPE[a.type] ?? "other"));
  const optional = (e: unknown) => {
    if (!(e instanceof PlaidError) || e.reauth) throw e;
  };

  // 3. Investments (optional product)
  if (kinds.has("investment"))
    try {
      const inv = await call<{
        accounts?: { account_id: string }[];
        holdings: { account_id: string; security_id: string; quantity: number; institution_value: number; cost_basis: number | null }[];
        securities: { security_id: string; name: string | null; ticker_symbol: string | null; type: string | null }[];
      }>("/investments/holdings/get", { access_token: token }, f);
      const sec = new Map(inv.securities.map((s) => [s.security_id, s]));
      // Every investment account Plaid reports on in this answer, so an account with nothing left in it is emptied too.
      // An account it didn't report on is never emptied.
      // (and any account that has holdings, in case the optional `accounts` list is missing: those rows are inserted below, so they must be cleared first)
      const reported = new Set([...(inv.accounts ?? []).map((a) => a.account_id), ...inv.holdings.map((h) => h.account_id)]);
      const accountIds = acc.accounts
        .filter((a) => TYPE[a.type] === "investment" && reported.has(a.account_id))
        .flatMap((a) => idByPlaid.get(a.account_id) ?? []);
      if (accountIds.length)
        await scope.tx.delete(holdings).where(and(eq(holdings.userId, scope.userId), eq(holdings.source, "plaid"), inArray(holdings.accountId, accountIds)));
      for (const h of inv.holdings) {
        const accountId = idByPlaid.get(h.account_id);
        if (!accountId) continue;
        const s = sec.get(h.security_id);
        await scope.tx.insert(holdings).values({
          userId: scope.userId,
          accountId,
          name: (s?.name ?? s?.ticker_symbol ?? "Holding").slice(0, 200),
          symbol: s?.ticker_symbol?.slice(0, 12) ?? null,
          securityType: securityType(s?.type),
          quantity: String(h.quantity),
          valueCents: Math.round(h.institution_value * 100),
          costBasisCents: h.cost_basis != null ? Math.round(h.cost_basis * 100) : null,
          source: "plaid",
          providerSecurityId: h.security_id,
          asOf: new Date(),
        });
        stats.holdings++;
      }
    } catch (e) {
      optional(e);
    }

  // 4. Debt details (optional product)
  if (kinds.has("credit") || kinds.has("loan"))
    try {
      const l = await call<{
        liabilities: {
          credit:
            | {
                account_id: string | null;
                aprs: { apr_percentage: number; apr_type: string }[];
                minimum_payment_amount: number | null;
                next_payment_due_date: string | null;
              }[]
            | null;
          student:
            | {
                account_id: string | null;
                interest_rate_percentage: number | null;
                minimum_payment_amount: number | null;
                next_payment_due_date: string | null;
              }[]
            | null;
          mortgage:
            | {
                account_id: string | null;
                interest_rate: { percentage: number | null } | null;
                next_monthly_payment: number | null;
                next_payment_due_date: string | null;
              }[]
            | null;
        };
      }>("/liabilities/get", { access_token: token }, f);
      const set = async (plaidId: string | null, apr: number | null | undefined, min: number | null, due: string | null) => {
        const id = plaidId && idByPlaid.get(plaidId);
        if (!id) return;
        await scope.tx
          .update(financialAccounts)
          .set({ aprBps: apr != null ? Math.round(apr * 100) : null, minPaymentCents: cents(min), nextPaymentDueDate: due })
          .where(eq(financialAccounts.id, id));
        stats.liabilities++;
      };
      for (const c of l.liabilities.credit ?? [])
        await set(
          c.account_id,
          (c.aprs.find((a) => a.apr_type === "purchase_apr") ?? c.aprs[0])?.apr_percentage,
          c.minimum_payment_amount,
          c.next_payment_due_date,
        );
      for (const s of l.liabilities.student ?? []) await set(s.account_id, s.interest_rate_percentage, s.minimum_payment_amount, s.next_payment_due_date);
      for (const m of l.liabilities.mortgage ?? []) await set(m.account_id, m.interest_rate?.percentage, m.next_monthly_payment, m.next_payment_due_date);
    } catch (e) {
      optional(e);
    }

  return { stats, creds: { accessToken: token, cursor } satisfies Creds };
}

function securityType(t: string | null | undefined) {
  switch (t) {
    case "equity":
      return "equity" as const;
    case "etf":
      return "etf" as const;
    case "mutual fund":
      return "mutual_fund" as const;
    case "cryptocurrency":
      return "crypto" as const;
    case "fixed income":
      return "bond" as const;
    case "cash":
      return "cash" as const;
    default:
      return "other" as const;
  }
}

/** Tells Plaid to forget an item (used when an account is deleted, where the rows go with the user). Throws on any failure. */
/** Plaid's answers for an item it no longer has: someone removed it already (or a first close worked). */
const GONE_AT_PLAID = new Set(["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"]);

/** Closes a bank link at Plaid. An item Plaid no longer has counts as closed, so a retry never sticks on it. */
export async function removeAtPlaid(encryptedCredentials: string | null, f?: Fetch) {
  try {
    await call("/item/remove", { access_token: readCreds({ encryptedCredentials }).accessToken }, f);
  } catch (e) {
    if (e instanceof PlaidError && e.code && GONE_AT_PLAID.has(e.code)) return;
    throw e;
  }
}

/** Disconnects at Plaid and removes the synced accounts (and their transactions and holdings). */
export async function removeItem(scope: UserScope, integrationId: string, f?: Fetch) {
  const item = await getItem(scope, integrationId);
  try {
    await call("/item/remove", { access_token: readCreds(item).accessToken }, f);
  } catch (e) {
    // If Plaid already forgot the item, still remove it here.
    if (!(e instanceof PlaidError) || e.code === "NETWORK" || e.code === "NOT_CONFIGURED") throw e;
  }
  const removed = await scope.tx
    .delete(financialAccounts)
    .where(and(eq(financialAccounts.userId, scope.userId), eq(financialAccounts.integrationId, item.id), eq(financialAccounts.source, "plaid")))
    .returning({ id: financialAccounts.id });
  await scope.tx.delete(integrations).where(eq(integrations.id, item.id));
  return { name: item.displayName ?? "Bank", accountsRemoved: removed.length };
}

// ------------------------------------------------------------ webhooks

const keyCache = new Map<string, { key: JsonWebKey; at: number }>();

/**
 * Verifies the Plaid-Verification JWT: ES256 signature with Plaid's published
 * key, issued within 5 minutes, and a SHA-256 of the exact body we received.
 */
export async function verifyWebhook(rawBody: string, jwt: string | null, f?: Fetch, now = Date.now()): Promise<boolean> {
  if (!jwt) return false;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  let header: { alg?: string; kid?: string };
  let payload: { iat?: number; request_body_sha256?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return false;
  }
  if (header.alg !== "ES256" || !header.kid) return false;
  let cached = keyCache.get(header.kid);
  if (!cached || now - cached.at > 24 * 3600_000) {
    try {
      const r = await call<{ key: JsonWebKey }>("/webhook_verification_key/get", { key_id: header.kid }, f);
      cached = { key: r.key, at: now };
      keyCache.set(header.kid, cached);
    } catch {
      return false;
    }
  }
  const ok = verifySig(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: createPublicKey({ key: cached.key, format: "jwk" }), dsaEncoding: "ieee-p1363" },
    Buffer.from(parts[2], "base64url"),
  );
  if (!ok) return false;
  if (!payload.iat || Math.abs(now / 1000 - payload.iat) > 300) return false;
  return createHash("sha256").update(rawBody).digest("hex") === payload.request_body_sha256;
}

/** Finds the owner of an item for a webhook (no user context yet). */
export async function ownerOfItem(db: Database, itemId: string) {
  const [row] = await db
    .select({ userId: connectionRegistry.userId, integrationId: connectionRegistry.integrationId })
    .from(connectionRegistry)
    .where(and(eq(connectionRegistry.provider, "plaid"), eq(connectionRegistry.externalId, itemId)));
  return row ?? null;
}

/** True while a connection is waiting for the user to sign in again (the 30-minute cron skips it until Reconnect). */
export async function plaidNeedsReauth(userId: string, integrationId: string) {
  return withUser(userId, async (s) => {
    const [row] = await s.tx
      .select({ status: integrations.status, metadata: integrations.metadata })
      .from(integrations)
      .where(and(eq(integrations.id, integrationId), eq(integrations.userId, userId)));
    return row?.status === "error" && !row.metadata?.pendingExpiration;
  });
}

/** The bank fixed the sign-in itself (LOGIN_REPAIRED webhook): clear the error so a sync can run. */
export async function markLoginRepaired(scope: UserScope, integrationId: string) {
  await scope.tx
    .update(integrations)
    .set({ status: "connected", lastError: null })
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId), eq(integrations.status, "error")));
}

/**
 * The bank has accounts the user hasn't shared yet (NEW_ACCOUNTS_AVAILABLE webhook). Kept in the connection's
 * metadata as `newAccountsAvailableAt` (an ISO time; `listPlaidConnections` returns it) so the app can offer
 * "Choose accounts". It's cleared when the user opens the Choose accounts flow.
 */
export async function recordNewAccountsAvailable(scope: UserScope, integrationId: string) {
  await scope.tx
    .update(integrations)
    .set({ metadata: sql`${integrations.metadata} || ${JSON.stringify({ newAccountsAvailableAt: new Date().toISOString() })}::jsonb` })
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId)));
}

/** Marks a connection as needing the user to sign in again (from an ITEM ERROR webhook). */
export async function markNeedsReauth(scope: UserScope, integrationId: string, message: string, opts: { stillWorking?: boolean } = {}) {
  await scope.tx
    .update(integrations)
    .set({
      status: "error",
      lastError: message.slice(0, 300),
      // PENDING_EXPIRATION: the connection still works for days, so the cron keeps syncing it (`plaidNeedsReauth`).
      metadata: opts.stillWorking ? sql`${integrations.metadata} || '{"pendingExpiration": true}'::jsonb` : sql`${integrations.metadata} - 'pendingExpiration'`,
    })
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId)));
}
