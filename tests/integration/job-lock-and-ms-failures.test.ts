import { eq, like, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as cronSync } from "@/app/api/cron/sync/route";
import { GET as cronPromises } from "@/app/api/cron/promises/route";
import { GET as cronNotify } from "@/app/api/cron/notify/route";
import { closeDb, getDb } from "@/server/db/client";
import { jobLocks } from "@/server/db/schema";
import { MAX_EXTRA_ROUNDS, releaseJobLock, withJobLock } from "@/server/db/job-lock";
import { errorReports } from "@/server/db/schema";
import { getMicrosoftConnection, microsoftNeedsReauth, saveMicrosoftConnection, syncMicrosoftConnection } from "@/server/integrations/microsoft";
import { makeUser } from "../helpers";

const mocks = vi.hoisted(() => ({ release: null as null | (() => void), entered: null as null | (() => void), runs: 0 }));
// The promises job is replaced by one that waits, so a second request can arrive while the first is still running.
vi.mock("@/server/services/proactive/engine", async (orig) => ({
  ...(await orig<typeof import("@/server/services/proactive/engine")>()),
  runProactive: vi.fn(async () => {
    mocks.runs++;
    // Only the first call waits (until the test lets go); the rest return at once.
    if (mocks.entered) {
      mocks.entered();
      mocks.entered = null;
      await new Promise<void>((r) => (mocks.release = r));
    }
    return [];
  }),
}));

const cleanup = () =>
  getDb()
    .delete(jobLocks)
    .where(or(like(jobLocks.name, "test:%"), like(jobLocks.name, "cron:test-%")));
afterAll(async () => {
  await cleanup();
  await closeDb();
});
const withPlaidSyncLockForTest = (name: string, run: (live: boolean) => Promise<unknown>) =>
  withJobLock(name, () => run(false), { rerun: (live) => run(live) });
const leftReports = async (job: string) =>
  (
    await getDb()
      .select()
      .from(errorReports)
      .where(eq(errorReports.message, `Job lock: ${job} left a skipped request to the next run`))
  ).reduce((n, r) => n + (r.count ?? 1), 0);
const skippedRequest = (name: string, live: boolean) => withJobLock(name, async () => "never", { rerun: async () => undefined, live });
beforeAll(async () => {
  await getDb()
    .delete(jobLocks)
    .where(or(like(jobLocks.name, "test:%"), like(jobLocks.name, "cron:test-%"))); // rows left by an earlier run
  await getDb().delete(errorReports).where(like(errorReports.message, "Job lock: test:%"));
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.MICROSOFT_CLIENT_ID = "ms-client";
  process.env.MICROSOFT_CLIENT_SECRET = "ms-secret";
});

const call = (h: (req: Request) => Promise<Response>, path: string) =>
  h(new Request(`https://lifeflow.test${path}`, { headers: { authorization: "Bearer cron-test-secret" } }));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const creds = { refreshToken: "rt-secret-1", accessToken: "at-secret-1", expiresAt: Date.now() - 1000, scope: "Calendars.Read" };

describe("job lock", () => {
  it("a second overlapping run is skipped and the lock is released afterwards, even on a throw", async () => {
    const first = await withJobLock("test:a", async () => {
      const second = await withJobLock("test:a", async () => "never");
      const other = await withJobLock("test:b", async () => "ok");
      return { second, other };
    });
    expect(first).toMatchObject({ skipped: false, value: { second: { skipped: true }, other: { skipped: false, value: "ok" } } });
    await expect(withJobLock("test:a", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await withJobLock("test:a", async () => 1)).toEqual({ skipped: false, value: 1 });
  });

  it("more concurrent locked jobs than the pool holds all finish (no deadlock)", async () => {
    // Each job needs a database connection of its own while it runs; the lease holds none.
    const jobs = Array.from({ length: 25 }, (_, i) =>
      withJobLock(`test:burst-${i}`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        await getDb().select().from(jobLocks);
        return i;
      }),
    );
    const done = await Promise.all(jobs);
    expect(done.every((d) => !d.skipped)).toBe(true);
    expect(await getDb().select().from(jobLocks).where(like(jobLocks.name, "test:burst-%"))).toHaveLength(0);
  });

  it("an expired lease can be taken over, and a finished old holder cannot free the new one", async () => {
    await getDb()
      .insert(jobLocks)
      .values({ name: "test:expired", holder: "dead-run", expiresAt: new Date(Date.now() - 1000) });
    const r = await withJobLock("test:expired", async () => {
      const [row] = await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:expired"));
      expect(row.holder).not.toBe("dead-run");
      await releaseJobLock("test:expired", "dead-run"); // the old run waking up late
      return (await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:expired"))).length;
    });
    expect(r).toEqual({ skipped: false, value: 1 }); // still held by the new run
  });

  it("a live lease is not taken over", async () => {
    await getDb()
      .insert(jobLocks)
      .values({ name: "test:live", holder: "other", expiresAt: new Date(Date.now() + 60_000) });
    expect(await withJobLock("test:live", async () => "no")).toEqual({ skipped: true });
    const [row] = await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:live"));
    expect(row.holder).toBe("other"); // release only deletes your own lease
    await releaseJobLock("test:live", "someone-else");
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:live"))).toHaveLength(1);
  });

  it("taking over an expired lease records one fixed-text error; a fresh claim records none", async () => {
    await getDb().delete(errorReports).where(eq(errorReports.route, "/api/cron/test-takeover"));
    const route = "/api/cron/test-takeover";
    await withJobLock("test:takeover-fresh", async () => 1, { route });
    expect(await getDb().select().from(errorReports).where(eq(errorReports.route, route))).toHaveLength(0);
    await getDb()
      .insert(jobLocks)
      .values({ name: "test:takeover", holder: "dead-run", expiresAt: new Date(Date.now() - 1000) });
    expect(await withJobLock("test:takeover", async () => 1, { route })).toEqual({ skipped: false, value: 1 });
    const rows = await getDb().select().from(errorReports).where(eq(errorReports.route, route));
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("Job lock: test:takeover taken over after an expired run");
  });

  it("ten concurrent claims on a fresh name, and on an expired row, let exactly one run", async () => {
    const race = () => Promise.all(Array.from({ length: 10 }, () => withJobLock("test:race", async () => new Promise((r) => setTimeout(() => r(1), 150)))));
    const fresh = await race();
    expect(fresh.filter((r) => !r.skipped)).toHaveLength(1);
    await getDb()
      .insert(jobLocks)
      .values({ name: "test:race", holder: "dead-run", expiresAt: new Date(Date.now() - 1000) });
    const expired = await race();
    expect(expired.filter((r) => !r.skipped)).toHaveLength(1);
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:race"))).toHaveLength(0);
  });

  it("a request skipped during a run makes the holder run once more (live if asked), bounded to two extra rounds", async () => {
    const seen: boolean[] = [];
    await withPlaidSyncLockForTest("test:rerun-a", async (live) => {
      seen.push(live);
      if (seen.length === 1) {
        expect(await skippedRequest("test:rerun-a", false)).toEqual({ skipped: true });
        expect(await skippedRequest("test:rerun-a", true)).toEqual({ skipped: true });
      }
    });
    expect(seen).toEqual([false, true]); // two requests, one extra run, live because one wanted it
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:rerun-a"))).toHaveLength(0);

    const always: boolean[] = [];
    await withPlaidSyncLockForTest("test:rerun-b", async (live) => {
      always.push(live);
      await skippedRequest("test:rerun-b", false); // someone asks every time
    });
    expect(always).toHaveLength(1 + MAX_EXTRA_ROUNDS);
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:rerun-b"))).toHaveLength(0);
    // the request that came in during the last round is reported, never silently dropped
    expect(await leftReports("test:rerun-b")).toBe(1);
  });

  it("a failed run still syncs for a request skipped meanwhile, then reports the failure", async () => {
    const seen: boolean[] = [];
    await expect(
      withPlaidSyncLockForTest("test:rerun-fail", async (live) => {
        seen.push(live);
        if (seen.length === 1) {
          await skippedRequest("test:rerun-fail", true);
          throw new Error("Plaid timed out");
        }
      }),
    ).rejects.toThrow(/timed out/);
    expect(seen).toEqual([false, true]);
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:rerun-fail"))).toHaveLength(0);
    expect(await leftReports("test:rerun-fail")).toBe(0);
  });

  it("no extra round starts after the time window; the waiting request is reported and the lease is freed", async () => {
    const seen: boolean[] = [];
    await withJobLock(
      "test:rerun-late",
      async () => {
        seen.push(false);
        await skippedRequest("test:rerun-late", false);
      },
      { rerun: async (live) => void seen.push(live), roundsWithinMs: 0 },
    );
    expect(seen).toEqual([false]);
    expect(await getDb().select().from(jobLocks).where(eq(jobLocks.name, "test:rerun-late"))).toHaveLength(0);
    expect(await leftReports("test:rerun-late")).toBe(1);
  });

  it("two overlapping promise check-in runs: one does the work, the other answers skipped", async () => {
    await makeUser();
    mocks.runs = 0;
    const entered = new Promise<void>((r) => (mocks.entered = r));
    const a = call(cronPromises, "/api/cron/promises");
    await entered;
    const b = await call(cronPromises, "/api/cron/promises");
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ ok: true, skipped: true });
    mocks.release?.();
    const res = await a;
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBeUndefined();
    expect(mocks.runs).toBeGreaterThan(0);
    const again = await call(cronPromises, "/api/cron/promises"); // lock released: it runs
    expect((await again.json()).skipped).toBeUndefined();
  });

  it("sync and notify crons skip while their own lock is held", async () => {
    await withJobLock("cron:sync", async () => {
      expect(await (await call(cronSync, "/api/cron/sync")).json()).toEqual({ ok: true, skipped: true });
    });
    await withJobLock("cron:notify", async () => {
      expect(await (await call(cronNotify, "/api/cron/notify")).json()).toEqual({ ok: true, skipped: true });
    });
  });
});

describe("Microsoft sync failures are recorded", () => {
  it("a revoked token marks the connection as needing reconnect, records one scrubbed error, and reconnecting clears it", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, creds, "x@school.edu"));
    const revoked = (async () => json({ error: "invalid_grant", error_description: "token rt-secret-1 for x@school.edu" }, 400)) as typeof fetch;
    await getDb().delete(errorReports).where(eq(errorReports.route, "/api/cron/sync"));
    await expect(syncMicrosoftConnection(u.user.id, "America/New_York", new Date(), revoked)).rejects.toThrow(/removed/);
    const c = await u.run((s) => getMicrosoftConnection(s));
    expect(c?.status).toBe("error");
    expect(c?.lastError).toMatch(/Reconnect/);
    expect(await microsoftNeedsReauth(u.user.id)).toBe(true);
    const rows = await getDb().select().from(errorReports).where(eq(errorReports.route, "/api/cron/sync"));
    expect(rows.length).toBeGreaterThan(0);
    const text = JSON.stringify(rows);
    for (const secret of ["rt-secret-1", "at-secret-1", "x@school.edu"]) expect(text).not.toContain(secret);
    await u.run((s) => saveMicrosoftConnection(s, creds, "x@school.edu"));
    expect(await microsoftNeedsReauth(u.user.id)).toBe(false);
  });

  it("a temporary failure keeps the connection usable and records a fixed message without calendar content", async () => {
    const bad = await makeUser();
    await bad.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() + 3_600_000 }, null));
    const down = (async () => json({ error: { code: "ServiceNotAvailable", message: "private subject line" } }, 503)) as typeof fetch;
    await expect(syncMicrosoftConnection(bad.user.id, "America/New_York", new Date(), down)).rejects.toThrow();
    const c = await bad.run((s) => getMicrosoftConnection(s));
    expect(c?.status).toBe("connected");
    expect(c?.lastError).toMatch(/Microsoft returned an error/);
    expect(c?.lastError).not.toContain("private subject");
    expect(await microsoftNeedsReauth(bad.user.id)).toBe(false);
  });

  it("the sync cron keeps going past a failing Microsoft connection", async () => {
    const bad = await makeUser();
    await bad.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() + 3_600_000 }, null));
    const good = await makeUser();
    await good.run((s) => saveMicrosoftConnection(s, { ...creds, accessToken: "at-good", expiresAt: Date.now() + 3_600_000 }, null));
    // The bad account's calls fail; the healthy one gets an empty calendar.
    vi.stubGlobal("fetch", async (_url: string, init?: { headers?: Record<string, string> }) =>
      init?.headers?.authorization === "Bearer at-good" ? json({ value: [] }) : json({ error: { code: "Boom" } }, 500),
    );
    try {
      const res = await call(cronSync, "/api/cron/sync");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.failed).toBeGreaterThanOrEqual(1);
      expect(body.synced).toBeGreaterThanOrEqual(1);
      expect(body.ok).toBe(true);
      expect((await good.run((s) => getMicrosoftConnection(s)))?.lastError).toBeNull();
      expect((await bad.run((s) => getMicrosoftConnection(s)))?.lastError).toMatch(/Microsoft returned an error/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a 401 even after a forced token refresh needs a reconnect, and the cron then skips that connection", async () => {
    const u = await makeUser();
    await u.run((s) => saveMicrosoftConnection(s, { ...creds, expiresAt: Date.now() + 3_600_000 }, null));
    const refused = (async (url: string) =>
      String(url).includes("/token")
        ? json({ access_token: "at-new", refresh_token: "rt-new", expires_in: 3600, scope: "Calendars.Read" })
        : json({ error: "nope" }, 401)) as typeof fetch;
    await expect(syncMicrosoftConnection(u.user.id, "America/New_York", new Date(), refused)).rejects.toThrow();
    expect(await microsoftNeedsReauth(u.user.id)).toBe(true);
    expect((await u.run((s) => getMicrosoftConnection(s)))?.lastError).toMatch(/Reconnect/);
    vi.stubGlobal("fetch", async () => json({ value: [] }));
    try {
      const body = await (await call(cronSync, "/api/cron/sync")).json();
      expect(body.skipped).toBeGreaterThanOrEqual(1);
      expect((await u.run((s) => getMicrosoftConnection(s)))?.status).toBe("error"); // untouched by the cron
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
