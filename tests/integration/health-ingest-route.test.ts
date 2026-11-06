import { like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/apple-health/ingest/route";
import { closeDb, getDb } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";
import { createHealthToken, isHealthKeyFormat } from "@/server/services/health";
import { makeUser } from "../helpers";

afterAll(closeDb);

const URL_ = "https://lifeflow.test/api/apple-health/ingest";
const req = (token: string, body: string, ip = "203.0.113.7", extra: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-real-ip": ip, ...extra }, body });
const buckets = async (prefix: string) =>
  (
    await getDb()
      .select()
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, `${prefix}%`))
  ).length;
const day = { metrics: { steps: 4200 } }; // today, in the user's time zone

beforeEach(async () => {
  await getDb().delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "health-%"));
});

describe("Apple Health ingest route: keys and limits", () => {
  it("knows the exact key shape", () => {
    expect(isHealthKeyFormat(`lfh_${"a".repeat(32)}`)).toBe(true);
    for (const bad of ["", "lfh_", "lfh_short", `lfh_${"a".repeat(33)}`, `lfh_${"a".repeat(31)}!`, `lfq_${"a".repeat(32)}`, `LFH_${"a".repeat(32)}`])
      expect(isHealthKeyFormat(bad), bad).toBe(false);
  });

  it("refuses made-up keys before counting anything, so they can't dodge a limit or fill the bucket table", async () => {
    for (let i = 0; i < 20; i++) expect((await POST(req(`made-up-${i}`, JSON.stringify(day)))).status).toBe(401);
    expect((await POST(new Request(URL_, { method: "POST", body: "{}" }))).status).toBe(401);
    expect(await buckets("health-")).toBe(0);
  });

  it("a well-shaped wrong key counts against the caller's IP only, and the IP limit stops guessing", async () => {
    const wrong = (i: number) => `lfh_${String(i).padStart(32, "x")}`;
    const r = await POST(req(wrong(1), JSON.stringify(day)));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "Invalid or revoked key. Create a new one in LifeFlow Settings, Integrations." });
    expect(await buckets("health-ip:203.0.113.7")).toBe(1);
    expect(await buckets("health-ingest:")).toBe(0);
    // Fill the IP's window, then even a new wrong key from that IP is refused with 429.
    await getDb().update(rateLimitBuckets).set({ count: 300 }).where(like(rateLimitBuckets.key, "health-ip:203.0.113.7"));
    expect((await POST(req(wrong(2), JSON.stringify(day)))).status).toBe(429);
    // Another IP is unaffected.
    expect((await POST(req(wrong(3), JSON.stringify(day), "198.51.100.9"))).status).toBe(401);
  });

  it("a real key saves, and its own per-key limit applies whatever IP it comes from", async () => {
    const { run } = await makeUser();
    const { id, token } = await run((s) => createHealthToken(s, "iPhone"));
    const ok = await POST(req(token, JSON.stringify(day)));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    expect(await buckets(`health-ingest:${id}`)).toBe(1);
    await getDb()
      .update(rateLimitBuckets)
      .set({ count: 60 })
      .where(like(rateLimitBuckets.key, `health-ingest:${id}`));
    expect((await POST(req(token, JSON.stringify(day), "198.51.100.20"))).status).toBe(429);
  });

  it("refuses an oversized body by its declared length and while reading, and bad JSON plainly", async () => {
    const { run } = await makeUser();
    const { token } = await run((s) => createHealthToken(s, "iPhone"));
    expect((await POST(req(token, "{}", undefined, { "content-length": "500000" }))).status).toBe(413);
    expect((await POST(req(token, JSON.stringify({ pad: "x".repeat(210_000) })))).status).toBe(413);
    const bad = await POST(req(token, "not json"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Body must be JSON" });
  });
});
