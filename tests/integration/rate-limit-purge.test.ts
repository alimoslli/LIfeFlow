import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";
import { purgeOldRateLimits, rateLimit } from "@/server/rate-limit";

afterAll(closeDb);
const db = getDb();
const ago = (ms: number) => new Date(Date.now() - ms);
const H = 3600_000;
const has = async (key: string) => (await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, key))).length > 0;

describe("the rate-limit purge (the privacy page says about a day)", () => {
  it("removes counters whose window ended more than a day ago, and keeps ones still in use", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const old = `purge:${tag}:old`;
    const recent = `purge:${tag}:recent`;
    await db.insert(rateLimitBuckets).values([
      { key: old, windowStart: ago(50 * H), count: 3 },
      { key: recent, windowStart: ago(23 * H), count: 3 },
    ]);
    // a counter really in use (a 24-hour window, started within the day) survives, and keeps counting
    const live = `purge:${tag}:live`;
    await rateLimit(db, live, 5, 86400);
    await purgeOldRateLimits(db);
    expect(await has(old)).toBe(false);
    expect(await has(recent)).toBe(true);
    expect(await has(live)).toBe(true);
    expect((await rateLimit(db, live, 5, 86400)).remaining).toBe(3);
  });

  it("keeps the monthly testing counters for their month", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const month = `jarvis:testing-month:${tag}`;
    const oldMonth = `voice:testing-month:${tag}`;
    await db.insert(rateLimitBuckets).values([
      { key: month, windowStart: ago(5 * 24 * H), count: 2 },
      { key: oldMonth, windowStart: ago(40 * 24 * H), count: 2 },
    ]);
    await purgeOldRateLimits(db);
    expect(await has(month)).toBe(true);
    expect(await has(oldMonth)).toBe(false);
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `%${tag}`));
  });
});
