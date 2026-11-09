import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as cronSync } from "@/app/api/cron/sync/route";
import { GET as cronPromises } from "@/app/api/cron/promises/route";
import { GET as cronNotify } from "@/app/api/cron/notify/route";
import { closeDb, getDb } from "@/server/db/client";
import { withJobLock } from "@/server/db/job-lock";
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

afterAll(closeDb);
beforeAll(() => {
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
    vi.stubGlobal("fetch", async () => json({ error: { code: "Boom" } }, 500));
    try {
      const res = await call(cronSync, "/api/cron/sync");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.failed).toBeGreaterThanOrEqual(1);
      expect(body.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
