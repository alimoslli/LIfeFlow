import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import { closeDb, getDb } from "@/server/db/client";
import { aiBudgets, users } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import type { ModelProvider, ModelTurn } from "@/server/jarvis/providers/types";
import { readBudgets, reserveBudget, settleBudget } from "@/server/services/ai-budget";
import { checkCeilings } from "@/server/services/ai-ceiling";
import { AiRefusedError, reserveAi } from "@/server/services/ai-gate";
import type { AiSubject } from "@/server/services/ai-limits";
import { makeUser, TZ } from "../helpers";

// Company ceilings for this file: $0.01 a month and a day (10,000 micro-dollars), and at most 3 paid uses a day. Settings only; nothing real is called.
const settings = vi.hoisted(() => ({
  values: { DATABASE_URL: "postgresql://x/y", AI_GLOBAL_MONTH_DOLLARS: 0.01, AI_GLOBAL_DAY_DOLLARS: 0.01 } as Record<string, unknown>,
}));
vi.mock("@/server/env", () => ({ env: () => settings.values }));

afterAll(closeDb);
beforeEach(async () => {
  settings.values = { DATABASE_URL: "postgresql://x/y", AI_GLOBAL_MONTH_DOLLARS: 0.01, AI_GLOBAL_DAY_DOLLARS: 0.01 };
  await getDb().delete(aiBudgets).where(like(aiBudgets.key, "g%"));
});

const subject = (over: Partial<AiSubject> = {}): AiSubject => ({
  userId: randomUUID(),
  tz: "UTC",
  accountKind: "standard",
  isAdmin: false,
  name: "Ray",
  ...over,
});
const NOW = new Date("2031-03-15T12:00:00Z");
const MONTH = "g:2031-03:micros";
const DAY = "g:2031-03-15:micros";
const money = (estimateMicros: number) => ({ feature: "chat" as const, firstStep: false, estimateMicros });
const used = async (key: string) => (await readBudgets([key])).get(key)!;

describe("the company ceiling", () => {
  it("twenty requests at the same moment can't together pass it", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserveAi(subject(), money(1_000), { now: NOW })));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(10); // 10 x 1,000 = the $0.01 ceiling exactly
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused.every((r) => r.reason instanceof AiRefusedError && r.reason.refusal.scope === "company")).toBe(true);
    expect(refused[0].reason.message).toBe("Ray isn't available right now. Try again later.");
    expect(await used(MONTH)).toEqual({ used: 0, held: 10_000 });
  });

  it("at 100% the skyling is paused for everyone except admins, who are still counted", async () => {
    for (let i = 0; i < 10; i++) await (await reserveAi(subject(), money(1_000), { now: NOW })).settle({ micros: 1_000 });
    await expect(reserveAi(subject(), money(1), { now: NOW })).rejects.toBeInstanceOf(AiRefusedError);
    const admin = await reserveAi(subject({ isAdmin: true }), money(1_000), { now: NOW });
    await admin.settle({ micros: 1_000 });
    expect((await used(MONTH)).used).toBe(11_000);
  });

  it("work with no known cost, like a voice call, is paused too, and admins still get through", async () => {
    for (let i = 0; i < 10; i++) await (await reserveAi(subject(), money(1_000), { now: NOW })).settle({ micros: 1_000 });
    await expect(reserveAi(subject(), { feature: "voice", seconds: 180 }, { now: NOW, limits: {} })).rejects.toThrow(
      "Ray isn't available right now. Try again later.",
    );
    await expect(reserveAi(subject(), { feature: "web_search", estimateMicros: null }, { now: NOW, limits: {} })).rejects.toBeInstanceOf(AiRefusedError);
    await expect(reserveAi(subject({ isAdmin: true }), { feature: "voice", seconds: 180 }, { now: NOW, limits: {} })).resolves.toBeTruthy();
  });

  it("a day's ceiling pauses only that day", async () => {
    settings.values.AI_GLOBAL_MONTH_DOLLARS = 100;
    for (let i = 0; i < 10; i++) await (await reserveAi(subject(), money(1_000), { now: NOW })).settle({ micros: 1_000 });
    await expect(reserveAi(subject(), money(1), { now: NOW })).rejects.toMatchObject({ refusal: { scope: "company", period: "day" } });
    const tomorrow = new Date("2031-03-16T12:00:00Z");
    await expect(reserveAi(subject(), money(1_000), { now: tomorrow })).resolves.toBeTruthy();
  });

  it("an optional count ceiling covers work whose cost isn't priced", async () => {
    settings.values.AI_GLOBAL_DAY_CALLS = 3;
    for (let i = 0; i < 3; i++) await reserveAi(subject(), { feature: "tidy", estimateMicros: null }, { now: NOW, limits: {} });
    await expect(reserveAi(subject(), { feature: "tidy", estimateMicros: null }, { now: NOW, limits: {} })).rejects.toBeInstanceOf(AiRefusedError);
  });
});

describe("warnings at 50% and 80% (and the stop at 100%)", () => {
  const spend = async (micros: number) => {
    const r = await reserveBudget(
      [
        { key: MONTH, kind: "micros", amount: micros, limit: null },
        { key: DAY, kind: "micros", amount: micros, limit: null },
      ],
      60,
    );
    if (!r.ok || !r.holdId) throw new Error("no hold");
    await settleBudget(r.holdId, { micros });
  };
  const mail = () => {
    const sent: { subject: string; text: string }[] = [];
    return { sent, send: async (subject: string, text: string) => (sent.push({ subject, text }), true) };
  };

  it("sends each warning once per period", async () => {
    const m = mail();
    await spend(4_999);
    expect(await checkCeilings(NOW, m)).toEqual([]);
    await spend(1);
    expect((await checkCeilings(NOW, m)).sort()).toEqual(["day 50", "month 50"]);
    expect(await checkCeilings(NOW, m)).toEqual([]); // not again
    await spend(3_000);
    expect((await checkCeilings(NOW, m)).sort()).toEqual(["day 80", "month 80"]);
    expect(await checkCeilings(NOW, m)).toEqual([]);
  });

  it("jumping straight past several thresholds sends one email for the highest", async () => {
    const m = mail();
    await spend(8_500);
    await checkCeilings(NOW, m);
    expect(m.sent).toHaveLength(2); // one for the month, one for the day
    expect(m.sent.every((x) => /80%/.test(x.subject))).toBe(true);
  });

  it("at 100% the email says it is paused for everyone except admins, with no personal details", async () => {
    const m = mail();
    await spend(10_000);
    await checkCeilings(NOW, m);
    const text = m.sent.map((x) => x.text).join("\n");
    expect(text).toMatch(/paused for everyone except admins/);
    expect(text).toMatch(/\$0\.01 of \$0\.01/);
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("a warning that couldn't be sent (no email set up) is tried again, not lost", async () => {
    await spend(6_000);
    expect(await checkCeilings(NOW, { send: async () => false })).toEqual([]);
    const m = mail();
    expect((await checkCeilings(NOW, m)).sort()).toEqual(["day 50", "month 50"]);
  });

  it("a settled reservation checks the ceilings by itself", async () => {
    // with no mail configured nothing is sent, but the check runs without error and leaves no claimed flag behind
    const h = await reserveAi(subject(), money(6_000), { now: NOW });
    await h.settle({ micros: 6_000 });
    const flags = await getDb().select().from(aiBudgets).where(like(aiBudgets.key, "gw:%2031%"));
    expect(flags).toEqual([]);
  });
});

describe("a turn at the company ceiling", () => {
  it("never reaches the model for a person, and does for an admin", async () => {
    const real = new Date();
    const month = `g:${real.toISOString().slice(0, 7)}:micros`;
    const r = await reserveBudget([{ key: month, kind: "micros", amount: 10_000, limit: null }], 60);
    if (!r.ok || !r.holdId) throw new Error("no hold");
    await settleBudget(r.holdId, { micros: 10_000 });
    const calls = { n: 0 };
    const provider: ModelProvider = {
      name: "scripted",
      model: "scripted",
      startTurn: (): ModelTurn => ({
        async *step() {
          calls.n++;
          yield { type: "step_done", text: "Hi.", toolCalls: [] };
        },
      }),
    };
    const person = await makeUser();
    const session = (u: typeof person): SessionUser => ({ id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" });
    const events: unknown[] = [];
    const out = await runJarvisTurn({ user: session(person), text: "hello", provider, emit: (e) => events.push(e) });
    expect(calls.n).toBe(0);
    expect(out.refused).toMatchObject({ scope: "company" });
    expect(JSON.stringify(events)).toMatch(/isn't available right now\. Try again later\./);

    const owner = await makeUser("Owner");
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = owner.user.email;
    await getDb().update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, owner.user.id));
    try {
      const again = await runJarvisTurn({ user: session(owner), text: "hello", provider, emit: () => {} });
      expect(again.refused).toBeFalsy();
      expect(calls.n).toBe(1);
    } finally {
      process.env.ADMIN_EMAILS = prev;
    }
  });
});
