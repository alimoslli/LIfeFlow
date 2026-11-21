import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The bank sync and the Gmail filing are stood in for: what's checked is whether they are asked for at all.
const mocks = vi.hoisted(() => ({
  owner: null as { userId: string; integrationId: string } | null,
  sync: vi.fn(async () => undefined),
  filed: vi.fn(async () => ({ filed: 0, checked: 0 })),
}));
vi.mock("@/server/integrations/plaid", async (orig) => ({
  ...(await orig<typeof import("@/server/integrations/plaid")>()),
  verifyWebhook: vi.fn(async () => true),
  ownerOfItem: vi.fn(async () => mocks.owner),
  syncConnection: mocks.sync,
}));
vi.mock("@/server/services/inbox/gmail", async (orig) => ({
  ...(await orig<typeof import("@/server/services/inbox/gmail")>()),
  fileFromGmail: mocks.filed,
}));

import { GET as cron } from "@/app/api/cron/sync/route";
import { POST as webhook } from "@/app/api/integrations/plaid/webhook/route";
import { createSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { connectionRegistry, integrations, jobLocks, sessions, users } from "@/server/db/schema";
import { exchangePublicToken } from "@/server/integrations/plaid";
import { IDLE_AFTER_DAYS, IDLE_SYNC_EVERY_DAYS, isIdle, lastSeenByUser } from "@/server/services/idle";
import { runDueSlot } from "@/server/services/proactive/engine";
import { makeUser, TZ } from "../helpers";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});
beforeAll(async () => {
  // the cron walks every connection in the database: start from an empty registry and never reach a real provider
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("no network in this test");
    }),
  );
  await getDb().delete(connectionRegistry);
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "sec";
  process.env.PLAID_ENV = "sandbox";
  process.env.APP_URL = "https://lifeflow.test";
  process.env.CRON_SECRET = "cron-test-secret";
});
beforeEach(async () => {
  mocks.sync.mockClear();
  mocks.filed.mockClear();
  await getDb().delete(jobLocks).where(eq(jobLocks.name, "cron:sync"));
});

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const exchangeFetch = (async (url: string | URL) =>
  new URL(String(url)).pathname === "/link/token/create"
    ? json({ link_token: "link-1", expiration: "2026-11-09T00:00:00Z" })
    : json({ access_token: "access-sandbox-abc", item_id: `item-${Math.random()}` })) as typeof fetch;

/** An account with a bank connection that last synced `syncedDaysAgo` days ago, made `madeDaysAgo` days ago. */
async function account(madeDaysAgo: number, syncedDaysAgo: number) {
  const u = await makeUser();
  const item = await u.run((s) => exchangePublicToken(s, "public-x", "Bank", exchangeFetch));
  await getDb()
    .update(users)
    .set({ createdAt: ago(madeDaysAgo) })
    .where(eq(users.id, u.user.id));
  await u.run((s) =>
    s.tx
      .update(integrations)
      .set({ lastSyncedAt: ago(syncedDaysAgo) })
      .where(eq(integrations.id, item.id)),
  );
  return { ...u, item };
}
const runCron = async () =>
  (await (await cron(new Request("https://lifeflow.test/api/cron/sync", { headers: { authorization: "Bearer cron-test-secret" } }))).json()) as {
    resting: number;
  };
const synced = (itemId: string) => mocks.sync.mock.calls.some((c) => (c as unknown[])[1] === itemId);
const newData = () =>
  webhook(
    new Request("https://lifeflow.test/api/integrations/plaid/webhook", {
      method: "POST",
      body: JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "i" }),
    }),
  );

// Owner, 2026-11-15: "pause after 7 days and refresh every 3 days".
describe("accounts that stopped opening the app", () => {
  it("idle means 7 days without the app being opened, counted from the last opening, or from sign-up when there is none", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const before = (days: number) => new Date(now.getTime() - days * DAY);
    expect(IDLE_AFTER_DAYS).toBe(7);
    expect(IDLE_SYNC_EVERY_DAYS).toBe(3);
    expect(isIdle(before(6.9), before(400), now)).toBe(false);
    expect(isIdle(before(7.1), before(400), now)).toBe(true);
    // no session left: a brand-new account is not idle, an old one is
    expect(isIdle(undefined, before(1), now)).toBe(false);
    expect(isIdle(undefined, before(30), now)).toBe(true);
  });

  it("the sync job rests an idle account's connection until 3 days have passed, and syncs an active account's every run", async () => {
    const idle = await account(30, 1);
    const due = await account(30, 4);
    const active = await account(30, 0.01);
    await createSession(getDb(), active.user.id);
    const out = await runCron();
    expect(synced(idle.item.id)).toBe(false);
    expect(synced(due.item.id)).toBe(true);
    expect(synced(active.item.id)).toBe(true);
    expect(out.resting).toBeGreaterThanOrEqual(1);
  });

  it("opening the app ends the rest: the very next run syncs", async () => {
    const back = await account(30, 1);
    await runCron();
    expect(synced(back.item.id)).toBe(false);
    await createSession(getDb(), back.user.id); // they opened the app
    expect((await lastSeenByUser(getDb())).get(back.user.id)).toBeInstanceOf(Date);
    mocks.sync.mockClear();
    await getDb().delete(jobLocks).where(eq(jobLocks.name, "cron:sync"));
    await runCron();
    expect(synced(back.item.id)).toBe(true);
  });

  it("a session last used more than 7 days ago still counts as idle", async () => {
    const stale = await account(30, 1);
    await createSession(getDb(), stale.user.id);
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: ago(8) })
      .where(eq(sessions.userId, stale.user.id));
    await runCron();
    expect(synced(stale.item.id)).toBe(false);
  });

  it("the bank's 'new data' notice waits for an idle account's next sync, and syncs at once for an active one", async () => {
    const idle = await account(30, 1);
    mocks.owner = { userId: idle.user.id, integrationId: idle.item.id };
    expect((await newData()).status).toBe(200);
    expect(synced(idle.item.id)).toBe(false);

    const active = await account(30, 1);
    await createSession(getDb(), active.user.id);
    mocks.owner = { userId: active.user.id, integrationId: active.item.id };
    expect((await newData()).status).toBe(200);
    expect(synced(active.item.id)).toBe(true);
  });

  it("a bank's 'sign in again' notice is acted on at once for an idle account too (only new data waits)", async () => {
    const idle = await account(30, 1);
    mocks.owner = { userId: idle.user.id, integrationId: idle.item.id };
    const res = await webhook(
      new Request("https://lifeflow.test/api/integrations/plaid/webhook", {
        method: "POST",
        body: JSON.stringify({ webhook_type: "ITEM", webhook_code: "ERROR", item_id: "i", error: { display_message: "Sign in to your bank again." } }),
      }),
    );
    expect(res.status).toBe(200);
    const [row] = await idle.run((s) =>
      s.tx.select({ status: integrations.status, lastError: integrations.lastError }).from(integrations).where(eq(integrations.id, idle.item.id)),
    );
    expect(row.status).toBe("error");
    expect(row.lastError).toBe("Sign in to your bank again.");
  });

  it("the morning look files nothing from Gmail for an idle account (a paid read per email), and files as before otherwise", async () => {
    const morning = new Date("2026-11-10T14:00:00Z"); // 9 AM in New York
    // filing reads emails with AI, so it runs only for someone who allowed AI (the clouds port, 2026-11-21)
    const prefs = { gmailFiling: true, aiConsentAt: "2026-01-01T00:00:00.000Z" } as Parameters<typeof runDueSlot>[2];
    const a = await makeUser("Idle Filing");
    await a.run((s) => runDueSlot(s, TZ, prefs, morning, { scheduled: true, idle: true }));
    expect(mocks.filed).not.toHaveBeenCalled();
    const b = await makeUser("Active Filing");
    await b.run((s) => runDueSlot(s, TZ, prefs, morning, { scheduled: true, idle: false }));
    expect(mocks.filed).toHaveBeenCalledTimes(1);
    // without AI allowed, nothing is read, idle or not
    const c = await makeUser("No AI Filing");
    await c.run((s) => runDueSlot(s, TZ, { gmailFiling: true } as Parameters<typeof runDueSlot>[2], morning, { scheduled: true, idle: false }));
    expect(mocks.filed).toHaveBeenCalledTimes(1);
  });
});
