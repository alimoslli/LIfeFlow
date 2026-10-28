import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { healthSamples, healthTokens } from "@/server/db/schema";
import { runJarvisTurn, type JarvisEvent } from "@/server/jarvis/agent";
import { getTool } from "@/server/jarvis/registry";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { createHealthToken, healthSummary, ingestHealth, listHealthTokens, resolveHealthToken, revokeHealthToken } from "@/server/services/health";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const NOW = new Date("2026-10-28T16:00:00Z");

describe("Apple Health ingest", () => {
  it("issues keys that store only a hash, resolve to the owner, and stop working once revoked", async () => {
    const { user, run } = await makeUser();
    const { id, token } = await run((s) => createHealthToken(s, "iPhone"));
    expect(token).toMatch(/^lfh_/);
    const [row] = await getDb().select().from(healthTokens).where(eq(healthTokens.id, id));
    expect(row.tokenHash).not.toContain(token);
    expect(await resolveHealthToken(getDb(), token)).toEqual({ userId: user.id, timezone: TZ });
    expect(await resolveHealthToken(getDb(), "lfh_wrong")).toBeNull();
    expect(await resolveHealthToken(getDb(), "not-a-key")).toBeNull();
    expect((await run(listHealthTokens))[0].lastUsedAt).not.toBeNull();
    await run((s) => revokeHealthToken(s, id));
    expect(await resolveHealthToken(getDb(), token)).toBeNull();
    expect(await run(listHealthTokens)).toHaveLength(0);
  });

  it("parses Shortcut-style values, converts units, and replaces a re-sent day", async () => {
    const { run } = await makeUser();
    const r = await run((s) =>
      ingestHealth(
        s,
        { metrics: { steps: "8,532", restingHeartRate: "61 bpm", weightLb: 172.4, sleepMinutes: 450, heartbeat: 1, activeEnergy: null } },
        TZ,
        NOW,
      ),
    );
    expect(r).toEqual({ saved: 4, days: 1, ignored: ["heartbeat"] });
    await run((s) => ingestHealth(s, { date: "2026-10-28", metrics: { steps: 9000 } }, TZ, NOW));
    await run((s) => ingestHealth(s, { days: [{ date: "2026-10-27", metrics: { steps: 4000 } }] }, TZ, NOW));
    const sum = await run((s) => healthSummary(s, TZ, 7, NOW));
    const by = Object.fromEntries(sum.metrics.map((m) => [m.metric, m]));
    expect(by.steps.latest).toEqual({ day: "2026-10-28", value: 9000 });
    expect(by.steps.average).toBe(6500);
    expect(by.weight_kg.latest.value).toBe(78.2);
    expect(by.sleep_hours.latest.value).toBe(7.5);
    expect(by.resting_heart_rate.latest.value).toBe(61);
  });

  it("rejects impossible values and dates far from today", async () => {
    const { run } = await makeUser();
    await expect(run((s) => ingestHealth(s, { metrics: { steps: 9_999_999 } }, TZ, NOW))).rejects.toThrow(/looks wrong/);
    await expect(run((s) => ingestHealth(s, { date: "2026-12-01", metrics: { steps: 1 } }, TZ, NOW))).rejects.toThrow(/out of range/);
    await expect(run((s) => ingestHealth(s, { metrics: { steps: -5 } }, TZ, NOW))).rejects.toThrow();
    await expect(run((s) => ingestHealth(s, { nope: true }, TZ, NOW))).rejects.toThrow();
  });

  it("keeps each user's health data private", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await a.run((s) => ingestHealth(s, { metrics: { steps: 100 } }, TZ, NOW));
    expect((await b.run((s) => healthSummary(s, TZ, 7, NOW))).metrics).toHaveLength(0);
    const seen = await b.run((s) => s.tx.select().from(healthSamples));
    expect(seen).toHaveLength(0);
  });

  it("lets the assistant read the summary through get_health_summary", async () => {
    const { user, run } = await makeUser();
    const tool = getTool("get_health_summary")!;
    const ctx = { userId: user.id, tz: TZ, today: "2026-10-28", now: NOW, conversationId: "", userText: "", memorySuggestions: false, run };
    expect(await tool.execute({ days: 7 }, ctx)).toMatchObject({ connected: false });
    await run((s) => ingestHealth(s, { metrics: { steps: 12000 } }, TZ, NOW));
    const out = (await tool.execute({ days: 7 }, ctx)) as { connected: boolean; metrics: { metric: string; latest: { value: number } }[] };
    expect(out.connected).toBe(true);
    expect(out.metrics[0]).toMatchObject({ metric: "steps", latest: { value: 12000 } });

    const events: JarvisEvent[] = [];
    await runJarvisTurn({
      user: { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" },
      text: "how many steps today?",
      emit: (e) => events.push(e),
      provider: new ScriptedProvider(({ step }) =>
        step === 0 ? { toolCalls: [{ name: "get_health_summary", args: { days: 7 } }] } : { text: "12,000 steps." },
      ),
    });
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ name: "get_health_summary", ok: true });
  });
});
