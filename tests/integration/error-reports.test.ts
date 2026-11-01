import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { errorReports, rateLimitBuckets } from "@/server/db/schema";
import { fingerprint, recordError, scrub } from "@/server/services/error-reports";

afterAll(closeDb);

describe("error alerts", () => {
  it("strips anything personal or secret from messages", () => {
    expect(scrub("User sam.lee@gsu.edu not found in 7f3c2a10-1b2c-4d5e-8f90-123456789abc")).toBe("User [email] not found in [id]");
    expect(scrub("Plaid failed for token access-sandbox-abcdefghijklmnopqrstuvwxyz012345")).toBe("Plaid failed for token [token]");
    expect(scrub("Bad key sk_live_ABCDEFGH12345678 on account 4111111111111111")).toBe("Bad key [secret] on account [n]");
  });

  it("groups the same kind of error and emails the owner on the 1st and 10th time only", async () => {
    const db = getDb();
    await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, "error-alert-email"));
    await db.delete(errorReports).where(like(errorReports.route, "/money/test-%"));
    const sent: { subject: string; to: string[] }[] = [];
    const fetch = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "LifeFlow <a@b.co>", ALERT_EMAIL: "owner@lifeflowweb.com" };
    const route = "/money/test-[n]"; // what the scrubber leaves of a numbered route
    const results = [];
    for (let i = 1; i <= 10; i++)
      results.push(await recordError(db, { source: "server", route, message: `TypeError: cannot read 'balance' (attempt ${i})` }, { fetch, env }));
    expect(new Set(results.map((r) => r.fingerprint)).size).toBe(1); // numbers don't split the group
    expect(results.map((r) => r.alerted)).toEqual([true, false, false, false, false, false, false, false, false, true]);
    expect(sent.map((m) => m.subject)).toEqual([`LifeFlow: new error on ${route}`, `LifeFlow: error seen 10 times on ${route}`]);
    expect(sent[0].to).toEqual(["owner@lifeflowweb.com"]);
    const [row] = await db.select().from(errorReports).where(eq(errorReports.fingerprint, results[0].fingerprint));
    expect(row).toMatchObject({ source: "server", route, count: 10 });
    expect(fingerprint({ source: "client", route, message: row.message })).not.toBe(row.fingerprint);
  });

  it("records but doesn't email when email isn't set up", async () => {
    const db = getDb();
    await db.delete(errorReports).where(eq(errorReports.route, "/plan/no-email"));
    const r = await recordError(db, { source: "client", route: "/plan/no-email", message: "ChunkLoadError" }, { env: {} });
    expect(r).toMatchObject({ count: 1, alerted: false });
  });
});
