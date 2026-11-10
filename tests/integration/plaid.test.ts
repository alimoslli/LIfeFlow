import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { connectionRegistry, financialAccounts, holdings, integrations, syncJobs, transactions, users } from "@/server/db/schema";
import {
  createLinkToken,
  exchangePublicToken,
  listPlaidConnections,
  mapPfc,
  ownerOfItem,
  reconnectLinkToken,
  removeItem,
  setPlaidAccountIncluded,
  syncConnection,
  verifyWebhook,
} from "@/server/integrations/plaid";
import { moneyOverview } from "@/server/services/finance/overview";
import { archiveAccount, listAccounts, listTurnedOffAccounts } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { getTool } from "@/server/jarvis/registry";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeAll(() => {
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "sec";
  process.env.PLAID_ENV = "sandbox";
  process.env.APP_URL = "https://lifeflow.test";
});

const txn = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  transaction_id: id,
  account_id: "acc-checking",
  amount,
  iso_currency_code: "USD",
  date: "2026-10-20",
  authorized_date: null,
  name: "Some merchant",
  merchant_name: null,
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" },
  ...extra,
});

/** A small stand-in for Plaid's API. `pages` are successive /transactions/sync responses. */
function fakePlaid(
  opts: {
    pages?: unknown[];
    loginRequired?: boolean;
    noInvestments?: boolean;
    only?: string[];
    failLiabilities?: boolean;
    noLiveBalance?: boolean;
    emptyHoldings?: boolean;
    investmentsError?: string;
    noReport?: boolean;
    holdingsWithoutAccounts?: boolean;
  } = {},
) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let page = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const f = (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ path, body });
    if (opts.loginRequired && path !== "/item/remove") return json({ error_code: "ITEM_LOGIN_REQUIRED", display_message: null }, 400);
    switch (path) {
      case "/link/token/create":
        return json({ link_token: "link-sandbox-123", expiration: "2026-10-28T20:00:00Z" });
      case "/item/public_token/exchange":
        return json({ access_token: "access-sandbox-abc", item_id: "item-1" });
      case "/accounts/balance/get":
        if (opts.noLiveBalance) return json({ error_code: "PRODUCTS_NOT_SUPPORTED" }, 400);
      // falls through: same accounts, live balances
      case "/accounts/get":
        return json({
          accounts: [
            {
              account_id: "acc-checking",
              name: "Plaid Checking",
              official_name: null,
              mask: "0000",
              type: "depository",
              subtype: "checking",
              balances: { available: 100, current: 110, limit: null, iso_currency_code: "USD" },
            },
            {
              account_id: "acc-card",
              name: "Plaid Credit Card",
              official_name: null,
              mask: "3333",
              type: "credit",
              subtype: "credit card",
              balances: { available: null, current: 410, limit: 2000, iso_currency_code: "USD" },
            },
            {
              account_id: "acc-ira",
              name: "Plaid IRA",
              official_name: null,
              mask: "5555",
              type: "investment",
              subtype: "ira",
              balances: { available: null, current: 5000, limit: null, iso_currency_code: "USD" },
            },
          ].filter((a) => !opts.only || opts.only.includes(a.account_id)),
        });
      case "/transactions/sync": {
        const pages = opts.pages ?? [
          {
            added: [txn("t1", 25.5), txn("t2", -1200, { name: "PAYROLL", personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" } })],
            modified: [],
            removed: [],
            next_cursor: "c1",
            has_more: false,
          },
        ];
        return json(pages[Math.min(page++, pages.length - 1)]);
      }
      case "/investments/holdings/get":
        if (opts.noInvestments) return json({ error_code: "PRODUCTS_NOT_SUPPORTED" }, 400);
        if (opts.investmentsError) return json({ error_code: opts.investmentsError, error_type: "ITEM_ERROR" }, 400);
        // Like the real API, the response names the investment accounts it reports on.
        if (opts.emptyHoldings) return json({ accounts: opts.noReport ? [] : [{ account_id: "acc-ira" }], holdings: [], securities: [] });
        return json({
          ...(!opts.holdingsWithoutAccounts && { accounts: [{ account_id: "acc-ira" }] }),
          holdings: [{ account_id: "acc-ira", security_id: "sec-vti", quantity: 10, institution_value: 2500, cost_basis: 2000 }],
          securities: [{ security_id: "sec-vti", name: "Vanguard Total Stock Market ETF", ticker_symbol: "VTI", type: "etf" }],
        });
      case "/liabilities/get":
        if (opts.failLiabilities) return json({ error_code: "INTERNAL_SERVER_ERROR", error_type: "API_ERROR" }, 500);
        return json({
          liabilities: {
            credit: [
              {
                account_id: "acc-card",
                aprs: [{ apr_percentage: 24.99, apr_type: "purchase_apr" }],
                minimum_payment_amount: 35,
                next_payment_due_date: "2026-11-15",
              },
            ],
            student: null,
            mortgage: null,
          },
        });
      case "/item/remove":
        return json({ request_id: "r" });
      default:
        return json({ error_code: "NOT_FOUND" }, 404);
    }
  }) as typeof fetch;
  return { f, calls };
}

async function connected(fake = fakePlaid()) {
  const u = await makeUser();
  const item = await u.run((s) => exchangePublicToken(s, "public-sandbox-xyz", "First Platypus Bank", fake.f));
  return { ...u, item, fake };
}

describe("Plaid", () => {
  it("creates a Link token for transactions without requiring optional Plaid products", async () => {
    const { f, calls } = fakePlaid();
    expect(await createLinkToken("user-1", {}, f)).toMatchObject({ linkToken: "link-sandbox-123" });
    expect(calls[0].body).toMatchObject({
      client_id: "cid",
      secret: "sec",
      products: ["transactions"],
      user: { client_user_id: "user-1" },
      webhook: "https://lifeflow.test/api/integrations/plaid/webhook",
    });
  });

  it("never names server settings or Plaid codes when a request is rejected; the details go to the server log", async () => {
    const rejecting = (code: string) =>
      (async () =>
        new Response(JSON.stringify({ error_code: code, error_message: "client_id or secret invalid", display_message: null }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const code of ["INVALID_API_KEYS", "INVALID_CLIENT_ID", "INVALID_FIELD"]) {
        const err = await createLinkToken("user-1", {}, rejecting(code)).catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe("The bank connection isn't available right now. Please try again later.");
        expect((err as Error).message).not.toMatch(/PLAID_|Plaid|INVALID|secret|client/i);
        expect(log).toHaveBeenCalledWith("[plaid]", "/link/token/create", 400, undefined, code, "client_id or secret invalid", undefined);
      }
    } finally {
      log.mockRestore();
    }
  });

  it("stores only an encrypted access token and registers the item for webhooks", async () => {
    const { user, run, item } = await connected();
    const [row] = await run((s) => s.tx.select().from(integrations).where(eq(integrations.id, item.id)));
    expect(row.encryptedCredentials).not.toContain("access-sandbox-abc");
    expect(row.displayName).toBe("First Platypus Bank");
    expect(await ownerOfItem(getDb(), "item-1")).toMatchObject({ userId: user.id, integrationId: item.id });
  });

  it("syncs accounts, transactions, holdings and card details into the same numbers every page uses", async () => {
    const { user, run, item, fake } = await connected();
    const stats = await syncConnection(user.id, item.id, TZ, fake.f);
    expect(stats).toEqual({ accounts: 3, added: 2, modified: 0, removed: 0, holdings: 1, liabilities: 1 });
    const accts = await run((s) => s.tx.select().from(financialAccounts).where(eq(financialAccounts.userId, user.id)));
    const card = accts.find((a) => a.type === "credit")!;
    expect(card).toMatchObject({
      currentBalanceCents: 41_000,
      creditLimitCents: 200_000,
      aprBps: 2499,
      minPaymentCents: 3_500,
      nextPaymentDueDate: "2026-11-15",
      source: "plaid",
    });
    const tx = await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)));
    expect(tx.find((t) => t.providerTransactionId === "t1")).toMatchObject({ amountCents: -2_550, kind: "expense" });
    expect(tx.find((t) => t.providerTransactionId === "t2")).toMatchObject({ amountCents: 120_000, kind: "income" });
    const o = await run((s) => moneyOverview(s, "2026-10-28"));
    expect(o.balances).toMatchObject({ cashCents: 11_000, creditOwedCents: 41_000, investmentsCents: 500_000 });
    const h = await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)));
    expect(h[0]).toMatchObject({ symbol: "VTI", valueCents: 250_000, costBasisCents: 200_000, securityType: "etf" });
    const [conn] = await run(listPlaidConnections);
    expect(conn.lastSyncedAt).not.toBeNull();
  });

  it("uses the cursor, applies changes and removals, keeps the user's category, and replaces pending", async () => {
    const pages = [
      { added: [txn("p1", 9.99, { pending: true })], modified: [], removed: [], next_cursor: "c1", has_more: false },
      {
        added: [txn("posted1", 9.99, { pending_transaction_id: "p1" }), txn("t9", 40)],
        modified: [],
        removed: [],
        next_cursor: "c2",
        has_more: false,
      },
      { added: [], modified: [txn("t9", 42)], removed: [{ transaction_id: "posted1" }], next_cursor: "c3", has_more: false },
    ];
    const fake = fakePlaid({ pages, noInvestments: true });
    const { user, run, item } = await connected(fake);
    await syncConnection(user.id, item.id, TZ, fake.f);
    await syncConnection(user.id, item.id, TZ, fake.f);
    let tx = await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)));
    expect(tx.map((t) => t.providerTransactionId).sort()).toEqual(["posted1", "t9"]); // pending replaced
    const t9 = tx.find((t) => t.providerTransactionId === "t9")!;
    const shopping = (await run((s) => getCategoryByName(s, "Clothing")))!;
    await run((s) => s.tx.update(transactions).set({ categoryId: shopping.id }).where(eq(transactions.id, t9.id)));
    await syncConnection(user.id, item.id, TZ, fake.f);
    tx = await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)));
    expect(tx.map((t) => t.providerTransactionId)).toEqual(["t9"]);
    expect(tx[0]).toMatchObject({ amountCents: -4_200, categoryId: shopping.id });
    const syncCalls = fake.calls.filter((c) => c.path === "/transactions/sync");
    expect(syncCalls.map((c) => c.body.cursor)).toEqual([undefined, "c1", "c2"]);
  });

  it("marks a connection that needs the user to sign in again, and keeps that status", async () => {
    const good = fakePlaid();
    const { user, run, item } = await connected(good);
    const bad = fakePlaid({ loginRequired: true });
    await expect(syncConnection(user.id, item.id, TZ, bad.f)).rejects.toThrow(/sign in again/);
    const [conn] = await run(listPlaidConnections);
    expect(conn).toMatchObject({ status: "error", lastError: expect.stringMatching(/Reconnect/) });
  });

  it("lets the user turn a bank account off: hidden, its bank data removed, still off after syncs, back on re-imports", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const checking = (await run((s) => s.tx.select().from(financialAccounts).where(eq(financialAccounts.userId, user.id)))).find(
      (a) => a.providerAccountId === "acc-checking",
    )!;
    await run((s) => setPlaidAccountIncluded(s, checking.id, false));
    const visible = async () => (await run((s) => listAccounts(s))).map((a) => a.name).sort();
    const txCount = async () => (await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).length;
    expect(await visible()).toEqual(["Plaid Credit Card", "Plaid IRA"]);
    expect(await txCount()).toBe(0);
    expect((await run(listTurnedOffAccounts)).map((a) => a.name)).toEqual(["Plaid Checking"]);

    // Syncs keep it off and skip its transactions.
    const stats = await syncConnection(user.id, item.id, TZ, fake.f);
    expect(stats!.accounts).toBe(2);
    expect(await visible()).toEqual(["Plaid Credit Card", "Plaid IRA"]);
    expect(await txCount()).toBe(0);
    expect((await run((s) => moneyOverview(s, "2026-10-28"))).balances.cashCents).toBe(0);

    // Back on: the next sync starts over and brings its transactions back.
    await run((s) => setPlaidAccountIncluded(s, checking.id, true));
    await syncConnection(user.id, item.id, TZ, fake.f);
    expect(await visible()).toEqual(["Plaid Checking", "Plaid Credit Card", "Plaid IRA"]);
    expect(await txCount()).toBe(2);
    expect(fake.calls.filter((c) => c.path === "/transactions/sync").at(-1)?.body.cursor).toBeUndefined();
  });

  it("hides accounts the bank stops sharing (Choose accounts), and asks Plaid to let the user choose", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const fewer = fakePlaid({ only: ["acc-card"] });
    await syncConnection(user.id, item.id, TZ, fewer.f);
    expect((await run((s) => listAccounts(s))).map((a) => a.name)).toEqual(["Plaid Credit Card"]);
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).toHaveLength(0);
    // No investment accounts left: the paid investments product isn't asked for.
    expect(fewer.calls.some((c) => c.path === "/investments/holdings/get")).toBe(false);

    const link = fakePlaid();
    await run((s) => reconnectLinkToken(s, item.id, link.f, { accountSelection: true }));
    expect(link.calls[0].body).toMatchObject({ access_token: "access-sandbox-abc", update: { account_selection_enabled: true } });
  });

  it("a problem with an optional product never throws away the sync; Sync now asks for live balances", async () => {
    const { user, run, item } = await connected();
    const flaky = fakePlaid({ failLiabilities: true });
    const stats = await syncConnection(user.id, item.id, TZ, flaky.f, { live: true });
    expect(stats).toMatchObject({ accounts: 3, added: 2, liabilities: 0 });
    expect(flaky.calls.some((c) => c.path === "/accounts/balance/get")).toBe(true);
    expect((await run((s) => moneyOverview(s, "2026-10-28"))).balances.creditOwedCents).toBe(41_000);

    // Live balances not available: falls back to Plaid's saved copy.
    const noLive = fakePlaid({ noLiveBalance: true });
    expect(await syncConnection(user.id, item.id, TZ, noLive.f, { live: true })).toMatchObject({ accounts: 3 });
    expect(noLive.calls.map((c) => c.path)).toContain("/accounts/get");
  });

  it("an account the bank shares again gets its history back (the cursor starts over)", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    await syncConnection(user.id, item.id, TZ, fakePlaid({ only: ["acc-card"] }).f);
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).toHaveLength(0);
    const again = fakePlaid();
    await syncConnection(user.id, item.id, TZ, again.f);
    expect((await run((s) => listAccounts(s))).map((a) => a.name).sort()).toEqual(["Plaid Checking", "Plaid Credit Card", "Plaid IRA"]);
    expect(again.calls.filter((c) => c.path === "/transactions/sync")[0].body.cursor).toBeUndefined();
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).toHaveLength(2);
  });

  it("holdings the bank no longer reports (everything sold) are removed", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(1);
    await syncConnection(user.id, item.id, TZ, fakePlaid({ emptyHoldings: true }).f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(0);
  });

  it("an account the user archived by hand stays archived through every sync, while one the bank stopped sharing still comes back", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const rows = await run((s) => s.tx.select().from(financialAccounts).where(eq(financialAccounts.userId, user.id)));
    const checking = rows.find((a) => a.providerAccountId === "acc-checking")!;
    const ira = rows.find((a) => a.providerAccountId === "acc-ira")!;
    await run((s) => archiveAccount(s, checking.id));
    // The bank stops sharing the IRA (it shares only the card), then shares everything again.
    await syncConnection(user.id, item.id, TZ, fakePlaid({ only: ["acc-card", "acc-checking"] }).f);
    await syncConnection(user.id, item.id, TZ, fake.f);
    await syncConnection(user.id, item.id, TZ, fake.f);
    const names = (await run((s) => listAccounts(s))).map((a) => a.name).sort();
    expect(names).toEqual(["Plaid Credit Card", "Plaid IRA"]);
    // What it already had is kept (not deleted by archiving, not re-added).
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.accountId, checking.id)))).toHaveLength(2);
    expect(ira.id).toBeTruthy();
    // The user can still bring it back from the turned-off list.
    expect((await run(listTurnedOffAccounts)).map((a) => a.name)).toEqual(["Plaid Checking"]);
  });

  it("an account the user turned off, which the bank stops and then resumes sharing, stays off: no transactions, no cursor reset", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const checking = (await run((s) => s.tx.select().from(financialAccounts).where(eq(financialAccounts.userId, user.id)))).find(
      (a) => a.providerAccountId === "acc-checking",
    )!;
    await run((s) => setPlaidAccountIncluded(s, checking.id, false));
    await syncConnection(user.id, item.id, TZ, fakePlaid({ only: ["acc-card", "acc-ira"] }).f);
    const resumed = fakePlaid();
    await syncConnection(user.id, item.id, TZ, resumed.f);
    expect((await run((s) => listAccounts(s))).map((a) => a.name).sort()).toEqual(["Plaid Credit Card", "Plaid IRA"]);
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).toHaveLength(0);
    expect(resumed.calls.filter((c) => c.path === "/transactions/sync")[0].body.cursor).toBe("c1");
  });

  it("existing holdings survive an investments error such as PRODUCT_NOT_READY", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(1);
    await syncConnection(user.id, item.id, TZ, fakePlaid({ investmentsError: "PRODUCT_NOT_READY" }).f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(1);
  });

  it("an investment account Plaid didn't report on is never emptied", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const f = fakePlaid({ emptyHoldings: true, noReport: true });
    await syncConnection(user.id, item.id, TZ, f.f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(1);
  });

  it("a holding whose account is missing from the response's accounts doesn't duplicate across syncs", async () => {
    const { user, run, item } = await connected();
    const f = fakePlaid({ holdingsWithoutAccounts: true });
    await syncConnection(user.id, item.id, TZ, f.f);
    await syncConnection(user.id, item.id, TZ, f.f);
    expect(await run((s) => s.tx.select().from(holdings).where(eq(holdings.userId, user.id)))).toHaveLength(1);
  });

  it("a problem with the investments product never throws away the sync", async () => {
    const { user, item } = await connected();
    const stats = await syncConnection(user.id, item.id, TZ, fakePlaid({ noInvestments: true }).f);
    expect(stats).toMatchObject({ accounts: 3, added: 2, holdings: 0 });
  });

  it("disconnecting removes the item at Plaid and its synced data here", async () => {
    const { user, run, item, fake } = await connected();
    await syncConnection(user.id, item.id, TZ, fake.f);
    const r = await run((s) => removeItem(s, item.id, fake.f));
    expect(r).toEqual({ name: "First Platypus Bank", accountsRemoved: 3 });
    expect(fake.calls.at(-1)?.path).toBe("/item/remove");
    expect(await run((s) => s.tx.select().from(transactions).where(eq(transactions.userId, user.id)))).toHaveLength(0);
    expect(await getDb().select().from(connectionRegistry).where(eq(connectionRegistry.integrationId, item.id))).toHaveLength(0);
  });

  it("an account locked under 13 never syncs: nothing written, not even a failed sync's note", async () => {
    const { user, run, item, fake } = await connected();
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "done", ageBlockedAt: new Date().toISOString() } })
      .where(eq(users.id, user.id));
    const calls = fake.calls.length;
    expect(await syncConnection(user.id, item.id, TZ, fake.f)).toBeNull();
    expect(fake.calls.length).toBe(calls); // Plaid isn't even asked
    expect(await run((s) => s.tx.select().from(financialAccounts).where(eq(financialAccounts.userId, user.id)))).toHaveLength(0);
    expect(await run((s) => s.tx.select().from(syncJobs).where(eq(syncJobs.userId, user.id)))).toHaveLength(0);
  });

  it("maps Plaid categories to LifeFlow categories and kinds", () => {
    expect(mapPfc({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }, -5000)).toEqual({
      category: "Credit Card Payment",
      kind: "transfer",
    });
    expect(mapPfc({ primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" }, -1500)).toEqual({ category: "Rideshare", kind: "expense" });
    expect(mapPfc({ primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" }, 1500)).toEqual({ category: "Restaurants", kind: "refund" });
    expect(mapPfc(null, -100)).toEqual({ category: null, kind: "expense" });
    // Every RENT_AND_UTILITIES detailed code contains "RENT"; only the rent itself is Rent.
    expect(mapPfc({ primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }, -120000)).toEqual({ category: "Rent", kind: "expense" });
    expect(mapPfc({ primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_TELEPHONE" }, -6500)).toEqual({ category: "Phone", kind: "expense" });
    expect(mapPfc({ primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE" }, -5999)).toEqual({
      category: "Internet",
      kind: "expense",
    });
    expect(mapPfc({ primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY" }, -8412)).toEqual({
      category: "Utilities",
      kind: "expense",
    });
    expect(mapPfc({ primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_WATER" }, -3100)).toEqual({ category: "Utilities", kind: "expense" });
  });

  it("the sync tool tells the skyling the bank connection isn't available, never Plaid's setup text", async () => {
    const { user, run } = await connected();
    const tool = getTool("sync_bank_accounts")!;
    const ctx = { userId: user.id, tz: TZ, today: "2026-10-28", now: new Date(), conversationId: "", userText: "", memorySuggestions: false, run };
    const invalidKeys = (async () =>
      new Response(JSON.stringify({ error_code: "INVALID_API_KEYS", display_message: null }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    vi.stubGlobal("fetch", invalidKeys);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const out = (await tool.execute({}, ctx)) as { results: { ok: boolean; error?: string; needsReconnect?: boolean }[] };
      expect(out.results).toEqual([
        { bank: "First Platypus Bank", ok: false, error: "The bank connection isn't available right now. Please try again later.", needsReconnect: false },
      ]);
      expect(JSON.stringify(out)).not.toMatch(/PLAID_|INVALID_API_KEYS|Check /);
      expect(log).toHaveBeenCalled();
      // The Accounts page shows the same plain words.
      const [row] = await run((s) => s.tx.select().from(integrations).where(eq(integrations.userId, user.id)));
      expect(row.lastError).toBe("The bank connection isn't available right now. Please try again later.");
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("Plaid webhook verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" };
  const keyFetch = (async () => new Response(JSON.stringify({ key: jwk }), { status: 200 })) as unknown as typeof fetch;
  const token = (body: string, iat: number, kid = "k1") => {
    const h = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString("base64url");
    const p = Buffer.from(JSON.stringify({ iat, request_body_sha256: createHash("sha256").update(body).digest("hex") })).toString("base64url");
    const sig = sign("sha256", Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
    return `${h}.${p}.${sig}`;
  };
  const now = Date.now();
  const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-1" });

  it("accepts a fresh, correctly signed body and rejects anything else", async () => {
    expect(await verifyWebhook(body, token(body, now / 1000), keyFetch, now)).toBe(true);
    expect(await verifyWebhook(body + " ", token(body, now / 1000), keyFetch, now)).toBe(false); // body changed
    expect(await verifyWebhook(body, token(body, now / 1000 - 3600), keyFetch, now)).toBe(false); // too old
    expect(await verifyWebhook(body, null, keyFetch, now)).toBe(false);
    const forged = token(body, now / 1000).split(".");
    forged[2] = Buffer.from("x".repeat(64)).toString("base64url");
    expect(await verifyWebhook(body, forged.join("."), keyFetch, now)).toBe(false);
  });
});
