import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/promises/route";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports, users } from "@/server/db/schema";
import { runProactive } from "@/server/services/proactive/engine";
import { makeUser } from "../helpers";

vi.mock("@/server/services/proactive/engine", async (orig) => ({
  ...(await orig<typeof import("@/server/services/proactive/engine")>()),
  runProactive: vi.fn(async () => {
    throw new Error("boom for user 4f1c0b9e-1111-4222-8333-944455556666 jane@example.com");
  }),
}));

afterAll(closeDb);

const ROUTE = "/api/cron/promises";
const call = (token?: string) => GET(new Request(`https://lifeflow.test${ROUTE}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeEach(async () => {
  process.env.CRON_SECRET = "cron-test-secret";
  await getDb().delete(errorReports).where(eq(errorReports.route, ROUTE));
});

describe("promise check-in cron", () => {
  it("refuses without the secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
  });

  it("counts failures, records them without user content, and keeps going", async () => {
    await makeUser();
    await makeUser();
    const res = await call("cron-test-secret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.failed).toBeGreaterThanOrEqual(2);
    expect(body.messages).toBe(0);
    const rows = await getDb().select().from(errorReports).where(eq(errorReports.route, ROUTE));
    expect(rows.length).toBe(1); // grouped by fingerprint
    expect(rows[0].count).toBe(body.failed);
    expect(rows[0].message).not.toMatch(/jane@example|4f1c0b9e|boom/);
  });

  it("skips an account locked under 13 (nothing of theirs is kept, and nothing is sent to them)", async () => {
    const locked = await makeUser();
    await getDb()
      .update(users)
      .set({ preferences: { onboarding: "done", ageBlockedAt: new Date().toISOString() } })
      .where(eq(users.id, locked.user.id));
    vi.mocked(runProactive).mockClear();
    expect((await call("cron-test-secret")).status).toBe(200);
    const seen = vi.mocked(runProactive).mock.calls.map((c) => c[0].scope.userId);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(locked.user.id);
  });
});
