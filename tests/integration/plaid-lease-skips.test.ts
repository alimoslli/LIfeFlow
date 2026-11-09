import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { withJobLock } from "@/server/db/job-lock";
import { integrations, jobLocks, syncJobs } from "@/server/db/schema";
import { POST as syncRoute } from "@/app/api/integrations/plaid/sync/route";
import { POST as exchangeRoute } from "@/app/api/integrations/plaid/exchange/route";
import { exchangePublicToken } from "@/server/integrations/plaid";
import { getTool } from "@/server/jarvis/registry";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

const h = vi.hoisted(() => ({ user: null as SessionUser | null, forceSkip: false }));
vi.mock("@/server/auth/current-user", () => ({ getSessionUser: async () => h.user }));
// The exchange route learns the connection id only while it runs, so its lease is simulated as held.
vi.mock("@/server/db/job-lock", async (orig) => {
  const real = await orig<typeof import("@/server/db/job-lock")>();
  return {
    ...real,
    withPlaidSyncLock: ((id: string, run: never, opts: never) =>
      h.forceSkip ? Promise.resolve({ skipped: true }) : real.withPlaidSyncLock(id, run, opts)) as typeof real.withPlaidSyncLock,
  };
});

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids)
    await getDb()
      .delete(jobLocks)
      .where(eq(jobLocks.name, `plaid-sync:${id}`));
  await closeDb();
});
beforeAll(() => {
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "sec";
  process.env.PLAID_ENV = "sandbox";
  process.env.APP_URL = "https://lifeflow.test";
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const exchangeFetch = (async (url: string | URL) =>
  new URL(String(url)).pathname === "/link/token/create"
    ? json({ link_token: "link-1", expiration: "2026-11-09T00:00:00Z" })
    : json({ access_token: "access-sandbox-abc", item_id: `item-${Math.random()}` })) as typeof fetch;

async function connected() {
  const u = await makeUser();
  const item = await u.run((s) => exchangePublicToken(s, "public-x", "Bank", exchangeFetch));
  ids.push(item.id);
  return { ...u, item };
}
const post = (route: (req: Request) => Promise<Response>, path: string, body: unknown) =>
  route(new Request(`https://lifeflow.test${path}`, { method: "POST", body: JSON.stringify(body) }));
const failedJobs = (run: Awaited<ReturnType<typeof connected>>["run"], id: string) =>
  run((s) => s.tx.select().from(syncJobs).where(eq(syncJobs.integrationId, id)));

describe("Plaid sync when another sync of the same bank holds the lease", () => {
  it("Sync now answers ok + alreadySyncing and writes no failed sync record", async () => {
    const { user, run, item } = await connected();
    h.user = { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" };
    await withJobLock(`plaid-sync:${item.id}`, async () => {
      const res = await post(syncRoute, "/api/integrations/plaid/sync", { id: item.id });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, synced: null, alreadySyncing: true });
    });
    expect(await failedJobs(run, item.id)).toHaveLength(0);
  });

  it("Sync now refuses a connection the user does not own, before touching the lease", async () => {
    const owner = await connected();
    const other = await makeUser();
    h.user = { id: other.user.id, email: other.user.email, name: other.user.name, timezone: TZ, accountKind: "standard" };
    const res = await post(syncRoute, "/api/integrations/plaid/sync", { id: owner.item.id });
    expect(res.status).toBe(404);
    expect(
      await getDb()
        .select()
        .from(jobLocks)
        .where(eq(jobLocks.name, `plaid-sync:${owner.item.id}`)),
    ).toHaveLength(0);
  });

  it("the exchange route still saves the connection and gives the calm note", async () => {
    const u = await makeUser();
    h.user = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
    vi.stubGlobal("fetch", exchangeFetch);
    h.forceSkip = true;
    try {
      const res = await post(exchangeRoute, "/api/integrations/plaid/exchange", { publicToken: "public-sandbox-xyz-1", institutionName: "Calm Bank" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ ok: true, name: "Calm Bank", synced: null });
      expect(body.note).toBe("Already syncing; your accounts will appear shortly.");
      const rows = await u.run((s) => s.tx.select().from(integrations).where(eq(integrations.userId, u.user.id)));
      expect(rows.filter((r) => r.provider === "plaid")).toHaveLength(1);
    } finally {
      h.forceSkip = false;
      vi.unstubAllGlobals();
    }
  });

  it("the sync_bank_accounts tool reports alreadySyncing, not an error", async () => {
    const { user, run, item } = await connected();
    const ctx = { userId: user.id, tz: TZ, today: "2026-10-28", now: new Date(), conversationId: "", userText: "", memorySuggestions: false, run };
    const out = await withJobLock(`plaid-sync:${item.id}`, async () => (await getTool("sync_bank_accounts")!.execute({}, ctx)) as { results: unknown[] });
    expect(out).toMatchObject({ skipped: false, value: { results: [{ ok: true, alreadySyncing: true }] } });
  });
});
