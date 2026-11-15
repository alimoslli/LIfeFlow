import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The slot runner is stood in for, so the job can be run over the whole table quickly: what's checked is what the job tells
// it about each account. (That an idle look files nothing from Gmail is checked on the real runner in idle-accounts.test.ts.)
vi.mock("@/server/services/proactive/engine", async (orig) => ({
  ...(await orig<typeof import("@/server/services/proactive/engine")>()),
  runDueSlot: vi.fn(async () => []),
}));

import { GET } from "@/app/api/cron/notify/route";
import { createSession } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { jobLocks, sessions, users } from "@/server/db/schema";
import { runDueSlot } from "@/server/services/proactive/engine";
import { makeUser } from "../helpers";

afterAll(closeDb);
beforeEach(async () => {
  process.env.CRON_SECRET = "cron-test-secret";
  await getDb().delete(jobLocks).where(eq(jobLocks.name, "cron:notify"));
  vi.mocked(runDueSlot).mockClear();
});

const DAY = 86_400_000;
const run = () => GET(new Request("https://lifeflow.test/api/cron/notify", { headers: { authorization: "Bearer cron-test-secret" } }));
/** What the job passed to the morning look for this account (its last argument). */
const told = (userId: string) => vi.mocked(runDueSlot).mock.calls.find((c) => c[0].userId === userId)?.[4];

// Owner, 2026-11-15: an account that hasn't opened the app in 7 days gets no paid AI in the background. The notify job is
// where that is decided for the morning look (which files Gmail with a paid read per email).
describe("the notify job and accounts that stopped opening the app", () => {
  it("runs the look as idle for an account not opened in 7 days, and as usual for one opened today", { timeout: 120_000 }, async () => {
    const idle = await makeUser("Idle Since");
    await getDb()
      .update(users)
      .set({ createdAt: new Date(Date.now() - 30 * DAY) })
      .where(eq(users.id, idle.user.id));
    const stale = await makeUser("Stale Session");
    await createSession(getDb(), stale.user.id);
    await getDb()
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 8 * DAY) })
      .where(eq(sessions.userId, stale.user.id));
    const active = await makeUser("Opened Today");
    await getDb()
      .update(users)
      .set({ createdAt: new Date(Date.now() - 30 * DAY) })
      .where(eq(users.id, active.user.id));
    await createSession(getDb(), active.user.id);

    expect((await run()).status).toBe(200);
    expect(told(idle.user.id)).toMatchObject({ scheduled: true, idle: true });
    expect(told(stale.user.id)).toMatchObject({ scheduled: true, idle: true });
    expect(told(active.user.id)).toMatchObject({ scheduled: true, idle: false });
  });
});
