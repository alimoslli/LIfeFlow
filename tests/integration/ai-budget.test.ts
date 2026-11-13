import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { aiBudgets, aiHolds } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { deleteUserBudgets, readBudgets, releaseBudget, reserveBudget, settleBudget, sweepBudgets, type BudgetLine } from "@/server/services/ai-budget";

afterAll(closeDb);

const key = () => `t:${randomUUID()}`;
const line = (k: string, amount: number, limit: number | null, kind: BudgetLine["kind"] = "count"): BudgetLine => ({ key: k, kind, amount, limit });
const read = async (k: string) => (await readBudgets([k])).get(k)!;
const holdsOf = (id: string) => getDb().select().from(aiHolds).where(eq(aiHolds.holdId, id));

describe("setting AI use aside in one database step", () => {
  it("lets exactly the allowed number through when twenty requests arrive at once", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveBudget([line(k, 1, 5)], 300)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.key === k)).toBe(true);
    expect(await read(k)).toEqual({ used: 0, held: 5 });
  });

  it("money: concurrent estimates can't together pass the limit", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveBudget([line(k, 300_000, 1_000_000, "micros")], 300)));
    expect(results.filter((r) => r.ok)).toHaveLength(3); // 3 x 300,000 = 900,000; a fourth would be 1,200,000
  });

  it("changes nothing at all when any one counter would go over", async () => {
    const [a, b] = [key(), key()];
    await reserveBudget([line(b, 1, 1)], 300);
    const r = await reserveBudget([line(a, 1, 10), line(b, 1, 1)], 300);
    expect(r).toEqual({ ok: false, key: b });
    expect(await read(a)).toEqual({ used: 0, held: 0 });
    expect(await read(b)).toEqual({ used: 0, held: 1 });
  });

  it("several counters in different orders at once do not deadlock", async () => {
    const [a, b] = [key(), key()];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => reserveBudget(i % 2 ? [line(a, 1, 100), line(b, 1, 100)] : [line(b, 1, 100), line(a, 1, 100)], 300)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await read(a)).toEqual({ used: 0, held: 20 });
  });

  it("a counter with no limit only counts", async () => {
    const k = key();
    expect((await reserveBudget([line(k, 7, null)], 300)).ok).toBe(true);
    expect(await read(k)).toEqual({ used: 0, held: 7 });
  });

  it("settling moves the hold to used with the real amount, and settling twice counts once", async () => {
    const k = key();
    const r = await reserveBudget([line(k, 500_000, 1_000_000, "micros")], 300);
    if (!r.ok || !r.holdId) throw new Error("expected a hold");
    expect(await settleBudget(r.holdId, { micros: 120_000 })).toBe(true);
    expect(await settleBudget(r.holdId, { micros: 120_000 })).toBe(false);
    expect(await read(k)).toEqual({ used: 120_000, held: 0 });
    expect(await holdsOf(r.holdId)).toHaveLength(0);
  });

  it("an unknown actual cost keeps the estimate counted; counts settle at what was reserved", async () => {
    const [m, c] = [key(), key()];
    const r = await reserveBudget([line(m, 40_000, null, "micros"), line(c, 1, null)], 300);
    if (!r.ok || !r.holdId) throw new Error("expected a hold");
    await settleBudget(r.holdId, { micros: null });
    expect(await read(m)).toEqual({ used: 40_000, held: 0 });
    expect(await read(c)).toEqual({ used: 1, held: 0 });
  });

  it("time counters settle with the measured seconds", async () => {
    const k = key();
    const r = await reserveBudget([line(k, 180, 1800, "seconds")], 300);
    if (!r.ok || !r.holdId) throw new Error("expected a hold");
    await settleBudget(r.holdId, { seconds: 42 });
    expect(await read(k)).toEqual({ used: 42, held: 0 });
  });

  it("a hold nobody settled expires, is counted as used by the next request, and is not counted twice", async () => {
    const k = key();
    const first = await reserveBudget([line(k, 4, 5)], 300);
    if (!first.ok || !first.holdId) throw new Error("expected a hold");
    await getDb()
      .update(aiHolds)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(aiHolds.holdId, first.holdId));
    // 4 are still counted (as used), so one more fits and a second does not
    expect((await reserveBudget([line(k, 1, 5)], 300)).ok).toBe(true);
    expect((await reserveBudget([line(k, 1, 5)], 300)).ok).toBe(false);
    expect(await read(k)).toEqual({ used: 4, held: 1 });
    // the late settle of the expired hold changes nothing
    expect(await settleBudget(first.holdId, { micros: 1 })).toBe(false);
    expect(await read(k)).toEqual({ used: 4, held: 1 });
  });

  it("the clean-up counts stale holds on keys nobody touches again", async () => {
    const k = key();
    const r = await reserveBudget([line(k, 3, null)], 300);
    if (!r.ok || !r.holdId) throw new Error("expected a hold");
    await getDb()
      .update(aiHolds)
      .set({ expiresAt: sql`now() - interval '5 minutes'` })
      .where(eq(aiHolds.holdId, r.holdId));
    expect(await sweepBudgets()).toBeGreaterThanOrEqual(1);
    expect(await read(k)).toEqual({ used: 3, held: 0 });
  });

  it("releasing a hold gives it back without counting it", async () => {
    const k = key();
    const r = await reserveBudget([line(k, 1, 1)], 300);
    if (!r.ok || !r.holdId) throw new Error("expected a hold");
    expect(await releaseBudget(r.holdId)).toBe(true);
    expect(await releaseBudget(r.holdId)).toBe(false);
    expect(await read(k)).toEqual({ used: 0, held: 0 });
    expect((await reserveBudget([line(k, 1, 1)], 300)).ok).toBe(true);
  });

  it("deleting an account removes its counters", async () => {
    const id = randomUUID();
    const k = `u:${id}:2026-11:msgs`;
    const r = await reserveBudget([line(k, 1, 5)], 300);
    await deleteUserBudgets(id);
    expect(await read(k)).toEqual({ used: 0, held: 0 });
    if (r.ok && r.holdId) expect(await holdsOf(r.holdId)).toHaveLength(0);
  });
});

describe("account deletion", () => {
  it("removes the person's AI usage rows and counters", async () => {
    const { makeUser } = await import("../helpers");
    const { deleteAccount } = await import("@/server/services/accounts");
    const { recordAi } = await import("@/server/services/ai-usage");
    const { aiUsage } = await import("@/server/db/schema");
    const u = await makeUser();
    const k = `u:${u.user.id}:2026-11:msgs`;
    await reserveBudget([line(k, 1, 5)], 300);
    await recordAi({ userId: u.user.id, feature: "chat", door: "chat_route", provider: "p", model: "m" });
    await deleteAccount(getDb(), u.user.id, "correct horse battery");
    expect(await read(k)).toEqual({ used: 0, held: 0 });
    expect(await getDb().select().from(aiUsage).where(eq(aiUsage.userId, u.user.id))).toHaveLength(0);
  });
});

describe("first use of several keys", () => {
  it("creates new counter rows in sorted order, so two first uses can't deadlock", async () => {
    const { rows } = await getDb().execute(sql`select pg_get_functiondef('ai_reserve(uuid,text[],text[],bigint[],bigint[],integer)'::regprocedure) as def`);
    expect(String((rows[0] as { def: string }).def)).toMatch(/SELECT k FROM unnest\(p_keys\) AS k ORDER BY k ON CONFLICT/);
    // fresh keys, opposite orders, all at once: none hangs, none fails
    const [a, b, c] = [key(), key(), key()];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        reserveBudget(i % 2 ? [line(a, 1, 100), line(b, 1, 100), line(c, 1, 100)] : [line(c, 1, 100), line(b, 1, 100), line(a, 1, 100)], 300),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

describe("held can never go negative (migration 0069)", () => {
  it("reserves, settles, releases and repeats at the same moment: held matches the holds, never below zero, never past the limit", async () => {
    const k = key();
    const LIMIT = 10_000;
    const check = async () => {
      const [row] = await getDb().select().from(aiBudgets).where(eq(aiBudgets.key, k));
      const holds = await getDb().select().from(aiHolds).where(eq(aiHolds.key, k));
      expect(row.held).toBeGreaterThanOrEqual(0);
      expect(row.used).toBeGreaterThanOrEqual(0);
      expect(row.used + row.held).toBeLessThanOrEqual(LIMIT);
      expect(row.held).toBe(holds.reduce((n, h) => n + h.amount, 0));
    };
    const ids = Array.from({ length: 30 }, () => randomUUID());
    const reserved = await Promise.all(ids.map((id) => reserveBudget([line(k, 1_000, LIMIT, "micros")], 300, { holdId: id })));
    expect(reserved.filter((r) => r.ok)).toHaveLength(10);
    await check();
    const won = ids.filter((_, i) => reserved[i].ok);
    // Every hold is settled twice and released once, all at the same moment: only the first of the three may do anything.
    const calls = won.flatMap((id) => [settleBudget(id, { micros: 900 }), settleBudget(id, { micros: 900 }), releaseBudget(id)]);
    const results = await Promise.all(calls);
    expect(results.filter(Boolean)).toHaveLength(won.length);
    await check();
    const after = await read(k);
    expect(after.held).toBe(0);
    expect(after.used + after.held).toBeLessThanOrEqual(LIMIT);
    // A second settle (or release) of a closed hold is a no-op.
    expect(await settleBudget(won[0], { micros: 900 })).toBe(false);
    expect(await releaseBudget(won[0])).toBe(false);
    expect(await read(k)).toEqual(after);
  });

  it("a counter can't disappear while work is set aside on it: its holds go with it, so a later counter never starts negative", async () => {
    const k = key();
    const r = await reserveBudget([line(k, 1_000, 10_000, "micros")], 1);
    expect(r.ok).toBe(true);
    await getDb().delete(aiBudgets).where(eq(aiBudgets.key, k));
    expect(await getDb().select().from(aiHolds).where(eq(aiHolds.key, k))).toHaveLength(0);
    await new Promise((res) => setTimeout(res, 1_100));
    expect((await reserveBudget([line(k, 1_000, 10_000, "micros")], 300)).ok).toBe(true);
    expect(await read(k)).toEqual({ used: 0, held: 1_000 });
  });

  it("the database refuses a negative counter", async () => {
    const k = key();
    await getDb().insert(aiBudgets).values({ key: k });
    await expect(getDb().update(aiBudgets).set({ held: -1 }).where(eq(aiBudgets.key, k))).rejects.toThrow();
  });
});
