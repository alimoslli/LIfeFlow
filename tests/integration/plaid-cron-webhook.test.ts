import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { GET as cron } from "@/app/api/cron/sync/route";
import { POST as webhook } from "@/app/api/integrations/plaid/webhook/route";
import { closeDb, getDb } from "@/server/db/client";
import { withJobLock, withPlaidSyncLock } from "@/server/db/job-lock";
import { connectionRegistry, integrations, jobLocks, syncJobs } from "@/server/db/schema";
import { exchangePublicToken, markNeedsReauth, reconnectLinkToken } from "@/server/integrations/plaid";
import { makeUser } from "../helpers";

const mocks = vi.hoisted(() => ({ owner: null as { userId: string; integrationId: string } | null, sync: vi.fn(async () => undefined) }));
vi.mock("@/server/integrations/plaid", async (orig) => ({
  ...(await orig<typeof import("@/server/integrations/plaid")>()),
  verifyWebhook: vi.fn(async () => true),
  ownerOfItem: vi.fn(async () => mocks.owner),
  // Only the webhook route's sync is observed; the cron test uses the real one (and a stubbed network).
  syncConnection: mocks.sync,
}));

afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});
beforeAll(async () => {
  // The cron walks EVERY connection in the database. Earlier files leave Google, Outlook and Canvas connections behind, and
  // the real cron would call those providers over the network (slow or hanging, growing with every file that ran before this
  // one), and can find the cron lease held. This file is about Plaid, so it starts from an empty registry (rows are derived
  // and every test makes its own user) and may never reach a real provider.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("no network in this test");
    }),
  );
  await getDb().delete(jobLocks).where(eq(jobLocks.name, "cron:sync"));
  await getDb().delete(connectionRegistry);
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "sec";
  process.env.PLAID_ENV = "sandbox";
  process.env.APP_URL = "https://lifeflow.test";
  process.env.CRON_SECRET = "cron-test-secret";
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const exchangeFetch = (async (url: string | URL) =>
  new URL(String(url)).pathname === "/link/token/create"
    ? json({ link_token: "link-1", expiration: "2026-11-09T00:00:00Z" })
    : json({ access_token: "access-sandbox-abc", item_id: `item-${Math.random()}` })) as typeof fetch;

async function connected() {
  const u = await makeUser();
  const item = await u.run((s) => exchangePublicToken(s, "public-x", "Bank", exchangeFetch));
  return { ...u, item };
}
const hook = (code: string) =>
  webhook(
    new Request("https://lifeflow.test/api/integrations/plaid/webhook", {
      method: "POST",
      body: JSON.stringify({ webhook_type: "ITEM", webhook_code: code, item_id: "i" }),
    }),
  );
type Run = <T>(fn: (s: import("@/server/db/with-user").UserScope) => Promise<T>) => Promise<T>;
const row = async (run: Run, id: string) => (await run((s) => s.tx.select().from(integrations).where(eq(integrations.id, id))))[0];

describe("Plaid cron and item webhooks", () => {
  it("the 30-minute cron skips a connection that needs the user to sign in again (no sync, no failed record)", async () => {
    const { user, run, item } = await connected();
    await run((s) => markNeedsReauth(s, item.id, "Reconnect"));
    mocks.sync.mockClear();
    const res = await cron(new Request("https://lifeflow.test/api/cron/sync", { headers: { authorization: "Bearer cron-test-secret" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBeGreaterThanOrEqual(1);
    expect(mocks.sync.mock.calls.some((c) => (c as unknown[])[1] === item.id)).toBe(false);
    const jobs = await run((s) =>
      s.tx
        .select()
        .from(syncJobs)
        .where(and(eq(syncJobs.userId, user.id), eq(syncJobs.integrationId, item.id))),
    );
    expect(jobs).toHaveLength(0);
    expect((await row(run, item.id)).status).toBe("error");
  });

  it("a connection with a pending expiration (still working) is still synced by the cron; a real sign-in failure after it is not", async () => {
    const { user, run, item } = await connected();
    mocks.owner = { userId: user.id, integrationId: item.id };
    expect((await hook("PENDING_EXPIRATION")).status).toBe(200);
    const runCron = () => cron(new Request("https://lifeflow.test/api/cron/sync", { headers: { authorization: "Bearer cron-test-secret" } }));
    mocks.sync.mockClear();
    await runCron();
    expect(mocks.sync.mock.calls.some((c) => (c as unknown[])[1] === item.id)).toBe(true);
    expect((await row(run, item.id)).status).toBe("error"); // the app still offers Reconnect
    expect((await hook("USER_PERMISSION_REVOKED")).status).toBe(200);
    mocks.sync.mockClear();
    await runCron();
    expect(mocks.sync.mock.calls.some((c) => (c as unknown[])[1] === item.id)).toBe(false);
  });

  it("a webhook arriving while the same connection is already syncing is skipped (answers 200, no second sync)", async () => {
    const { user, item } = await connected();
    mocks.owner = { userId: user.id, integrationId: item.id };
    const hookTransactions = () =>
      webhook(
        new Request("https://lifeflow.test/api/integrations/plaid/webhook", {
          method: "POST",
          body: JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "i" }),
        }),
      );
    mocks.sync.mockClear();
    await withJobLock(`plaid-sync:${item.id}`, async () => {
      expect((await hookTransactions()).status).toBe(200);
      expect(mocks.sync).not.toHaveBeenCalled(); // skipped now; a holder without a rerun just finishes
    });
    expect((await hookTransactions()).status).toBe(200); // lease released: it syncs
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it("a webhook during a held sync leads to exactly one more sync after the first finishes", async () => {
    const { user, item } = await connected();
    mocks.owner = { userId: user.id, integrationId: item.id };
    const runs: boolean[] = [];
    const hookTransactions = () =>
      webhook(
        new Request("https://lifeflow.test/api/integrations/plaid/webhook", {
          method: "POST",
          body: JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "i" }),
        }),
      );
    mocks.sync.mockClear();
    await withPlaidSyncLock(item.id, async (live) => {
      runs.push(live);
      if (runs.length === 1) expect((await hookTransactions()).status).toBe(200); // Plaid sends it once
    });
    expect(runs).toEqual([false, false]);
    expect(mocks.sync).not.toHaveBeenCalled(); // the webhook itself did not sync; the holder did, once more
    expect(
      await getDb()
        .select()
        .from(jobLocks)
        .where(eq(jobLocks.name, `plaid-sync:${item.id}`)),
    ).toHaveLength(0);
  });

  it("LOGIN_REPAIRED clears the error and syncs", async () => {
    const { user, run, item } = await connected();
    await run((s) => markNeedsReauth(s, item.id, "Reconnect"));
    mocks.owner = { userId: user.id, integrationId: item.id };
    mocks.sync.mockClear();
    expect((await hook("LOGIN_REPAIRED")).status).toBe(200);
    expect(await row(run, item.id)).toMatchObject({ status: "connected", lastError: null });
    expect(mocks.sync).toHaveBeenCalledWith(user.id, item.id, expect.any(String), undefined, { live: false });
  });

  it("NEW_ACCOUNTS_AVAILABLE is recorded on the connection until the user opens Choose accounts", async () => {
    const { user, run, item } = await connected();
    mocks.owner = { userId: user.id, integrationId: item.id };
    expect((await hook("NEW_ACCOUNTS_AVAILABLE")).status).toBe(200);
    expect((await row(run, item.id)).metadata).toMatchObject({ newAccountsAvailableAt: expect.any(String) });
    await run((s) => reconnectLinkToken(s, item.id, exchangeFetch, { accountSelection: true }));
    expect((await row(run, item.id)).metadata).not.toHaveProperty("newAccountsAvailableAt");
  });
});
