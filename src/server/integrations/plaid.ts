import { createHash, createPublicKey, verify as verifySig, type JsonWebKey } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { todayIn } from "@/lib/dates";
import { decryptSecret, encryptSecret } from "../crypto";
import { connectionRegistry, financialAccounts, holdings, integrations, syncJobs, transactions, type AccountType, type TransactionKind } from "../db/schema";
import type { Database } from "../db/client";
import { withUser, type UserScope } from "../db/with-user";
import { categoryIdByName, keywordCategory, ruleFor } from "../services/finance/categorize";
import { recordNetWorth } from "../services/finance/investing";

/**
 * Plaid: read-only bank, card, loan and investment data.
 *
 * - The user signs in to their bank inside Plaid Link; LifeFlow never sees
 *   bank credentials. We store only Plaid's access token, AES-GCM encrypted.
 * - Products: transactions (required), investments and liabilities (optional,
 *   used when the institution supports them). Nothing here can move money.
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

const SKIPPABLE = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_ENABLED",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_LIABILITY_ACCOUNTS",
  "ADDITIONAL_CONSENT_REQUIRED",
  "PRODUCT_NOT_READY",
  "INVALID_PRODUCT",
  "NO_ACCOUNTS",
]);
const REAUTH = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ACCESS_NOT_GRANTED", "INVALID_ACCESS_TOKEN"]);

async function call<T>(path: string, body: Record<string, unknown>, f: Fetch = fetch): Promise<T> {
  const cfg = plaidConfig();
  if (!cfg) throw new PlaidError("Bank connections aren't available yet.", "NOT_CONFIGURED");
  let res: Response;
  try {
    res = await f(`${cfg.baseUrl}${path}`, {
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
    const msg = typeof json.display_message === "string" && json.display_message ? json.display_message : "Your bank connection needs attention.";
    throw new PlaidError(code && REAUTH.has(code) ? "Your bank needs you to sign in again. Use Reconnect." : msg, code, !!code && REAUTH.has(code));
  }
  return json as T;
}

// ------------------------------------------------------------ connect

export async function createLinkToken(userId: string, opts: { accessToken?: string } = {}, f?: Fetch) {
  const cfg = plaidConfig();
  const r = await call<{ link_token: string; expiration: string }>(
    "/link/token/create",
    {
      client_name: "LifeFlow",
      user: { client_user_id: userId },
      country_codes: ["US"],
      language: "en",
      ...(opts.accessToken
        ? { access_token: opts.accessToken } // update mode: re-authenticate an existing connection
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

/** Link token for re-authenticating a connection that needs attention. */
export async function reconnectLinkToken(scope: UserScope, integrationId: string, f?: Fetch) {
  const row = await getItem(scope, integrationId);
  return createLinkToken(scope.userId, { accessToken: readCreds(row).accessToken }, f);
}

async function getItem(scope: UserScope, integrationId: string) {
  const [row] = await scope.tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId), eq(integrations.provider, "plaid")));
  if (!row) throw new PlaidError("Bank connection not found.", "NOT_FOUND");
  return row;
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
  name: string;
  merchant_name: string | null;
  pending: boolean;
  pending_transaction_id: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
};

/** Plaid's categories → LifeFlow's default category names and transaction kinds. */
export function mapPfc(pfc: PlaidTxn["personal_finance_category"], amountCents: number): { category: string | null; kind: TransactionKind } {
  const p = pfc?.primary ?? "";
  const d = pfc?.detailed ?? "";
  const out = amountCents < 0;
  if (p === "INCOME")
    return { category: d.includes("WAGES") ? "Paycheck" : d.includes("INTEREST") ? "Interest Income" : "Side Income", kind: out ? "expense" : "income" };
  if (p === "TRANSFER_IN" || p === "TRANSFER_OUT")
    return { category: d.includes("SAVINGS") ? "Savings Transfer" : d.includes("INVESTMENT") ? "Investment Transfer" : null, kind: "transfer" };
  if (p === "LOAN_PAYMENTS") return { category: d.includes("CREDIT_CARD") ? "Credit Card Payment" : null, kind: "transfer" };
  const map: Record<string, (det: string) => string> = {
    BANK_FEES: () => "Fees & Interest",
    ENTERTAINMENT: (x) => (x.includes("TV_AND_MOVIES") || x.includes("MUSIC") ? "Streaming" : x.includes("VIDEO_GAMES") ? "Games" : "Events"),
    FOOD_AND_DRINK: (x) => (x.includes("GROCERIES") ? "Groceries" : x.includes("COFFEE") ? "Coffee" : "Restaurants"),
    GENERAL_MERCHANDISE: (x) => (x.includes("CLOTHING") ? "Clothing" : x.includes("ELECTRONICS") ? "Electronics" : "Household"),
    HOME_IMPROVEMENT: () => "Household",
    MEDICAL: (x) => (x.includes("PHARMAC") ? "Pharmacy" : "Medical"),
    PERSONAL_CARE: (x) => (x.includes("GYMS") ? "Fitness" : "Personal Care"),
    GENERAL_SERVICES: (x) => (x.includes("INSURANCE") ? "Insurance" : x.includes("EDUCATION") ? "Tuition" : "Other"),
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
    TRAVEL: () => "Travel",
    RENT_AND_UTILITIES: (x) => (x.includes("RENT") ? "Rent" : x.includes("TELEPHONE") ? "Phone" : x.includes("INTERNET") ? "Internet" : "Utilities"),
  };
  const fn = map[p];
  return { category: fn ? fn(d) : null, kind: out ? "expense" : "refund" };
}

// ------------------------------------------------------------ sync

export type SyncResult = { accounts: number; added: number; modified: number; removed: number; holdings: number; liabilities: number };

/** Pulls balances, new/changed/removed transactions, holdings and debt details for one connection. */
export async function syncItem(scope: UserScope, integrationId: string, tz: string, f?: Fetch): Promise<SyncResult> {
  const item = await getItem(scope, integrationId);
  const creds = readCreds(item);
  const started = new Date();
  const result = await runSync(scope, item.id, creds, f);
  await scope.tx
    .update(integrations)
    .set({ status: "connected", lastError: null, lastSyncedAt: new Date(), encryptedCredentials: encryptSecret(JSON.stringify(result.creds)) })
    .where(eq(integrations.id, item.id));
  await scope.tx
    .insert(syncJobs)
    .values({ userId: scope.userId, integrationId, kind: "plaid.sync", status: "succeeded", startedAt: started, finishedAt: new Date(), stats: result.stats });
  await recordNetWorth(scope, todayIn(tz));
  return result.stats;
}

/**
 * Syncs in its own transaction. If it fails, the failure is recorded in a
 * separate transaction (the sync's own writes roll back), so the user sees
 * what went wrong and whether they need to reconnect.
 */
export async function syncConnection(userId: string, integrationId: string, tz: string, f?: Fetch) {
  try {
    return await withUser(userId, (s) => syncItem(s, integrationId, tz, f));
  } catch (e) {
    const msg = e instanceof PlaidError ? e.message : "Sync failed. Please try again.";
    await withUser(userId, async (s) => {
      await s.tx
        .update(integrations)
        .set({ ...(e instanceof PlaidError && e.reauth && { status: "error" as const }), lastError: msg })
        .where(and(eq(integrations.id, integrationId), eq(integrations.userId, userId)));
      await s.tx.insert(syncJobs).values({ userId, integrationId, kind: "plaid.sync", status: "failed", finishedAt: new Date(), error: msg });
    }).catch(() => undefined);
    throw e;
  }
}

async function runSync(scope: UserScope, integrationId: string, creds: Creds, f?: Fetch) {
  const stats: SyncResult = { accounts: 0, added: 0, modified: 0, removed: 0, holdings: 0, liabilities: 0 };
  const token = creds.accessToken;

  // 1. Accounts and balances
  const acc = await call<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: token }, f);
  const idByPlaid = new Map<string, string>();
  for (const a of acc.accounts) {
    const m = mapAccount(a);
    const [row] = await scope.tx
      .insert(financialAccounts)
      .values({ ...m, userId: scope.userId, integrationId, source: "plaid", providerAccountId: a.account_id, balanceUpdatedAt: new Date() })
      .onConflictDoUpdate({
        target: [financialAccounts.userId, financialAccounts.source, financialAccounts.providerAccountId],
        targetWhere: sql`provider_account_id is not null`,
        set: { ...m, integrationId, balanceUpdatedAt: new Date(), archivedAt: null },
      })
      .returning({ id: financialAccounts.id });
    idByPlaid.set(a.account_id, row.id);
    stats.accounts++;
  }

  // 2. Transactions (cursor-based: only what changed since last time)
  let cursor = creds.cursor;
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
      const merchantName = t.merchant_name?.slice(0, 200) ?? null;
      const rule = await ruleFor(scope, { merchantName, description });
      const pfc = mapPfc(t.personal_finance_category, amountCents);
      const categoryName = pfc.category ?? keywordCategory({ merchantName, description });
      const cat = rule ? null : categoryName ? await categoryIdByName(scope, categoryName) : null;
      const values = {
        accountId,
        date: t.date,
        authorizedDate: t.authorized_date,
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
        .select({ id: transactions.id, categoryId: transactions.categoryId, kind: transactions.kind, notes: transactions.notes })
        .from(transactions)
        .where(and(eq(transactions.userId, scope.userId), eq(transactions.providerTransactionId, t.transaction_id)));
      if (existing) {
        // Keep the user's own category choice and notes; refresh everything else from the bank.
        await scope.tx
          .update(transactions)
          .set({ ...values, categoryId: existing.categoryId ?? values.categoryId, kind: existing.categoryId ? existing.kind : values.kind })
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

  // 3. Investments (optional product)
  try {
    const inv = await call<{
      holdings: { account_id: string; security_id: string; quantity: number; institution_value: number; cost_basis: number | null }[];
      securities: { security_id: string; name: string | null; ticker_symbol: string | null; type: string | null }[];
    }>("/investments/holdings/get", { access_token: token }, f);
    const sec = new Map(inv.securities.map((s) => [s.security_id, s]));
    const accountIds = [...new Set(inv.holdings.map((h) => idByPlaid.get(h.account_id)).filter(Boolean))] as string[];
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
    if (!(e instanceof PlaidError && e.code && SKIPPABLE.has(e.code))) throw e;
  }

  // 4. Debt details (optional product)
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
    if (!(e instanceof PlaidError && e.code && SKIPPABLE.has(e.code))) throw e;
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

/** Marks a connection as needing the user to sign in again (from an ITEM ERROR webhook). */
export async function markNeedsReauth(scope: UserScope, integrationId: string, message: string) {
  await scope.tx
    .update(integrations)
    .set({ status: "error", lastError: message.slice(0, 300) })
    .where(and(eq(integrations.id, integrationId), eq(integrations.userId, scope.userId)));
}
