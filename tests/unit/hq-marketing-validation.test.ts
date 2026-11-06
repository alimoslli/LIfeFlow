import { describe, expect, it } from "vitest";
import type { Database } from "@/server/db/client";
import { createContent, isRealWhen, recordMetrics, saveControls, updateContent } from "@/server/services/hq-marketing";

// Validation runs before the database is touched, so these never need one.
const noDb = null as unknown as Database;
const agent = { kind: "agent", keyName: "LF Marketing", sessionId: null } as const;
const owner = { kind: "owner", email: "o@test.local" } as const;
const admin = { id: "00000000-0000-4000-8000-000000000000", email: "o@test.local" };
const ID = "00000000-0000-4000-8000-000000000001";

const bad = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

describe("content validation", () => {
  it("needs a title of 1 to 140 characters", async () => {
    await bad(createContent(noDb, agent, { kind: "post", title: "   " }), /title/);
    await bad(createContent(noDb, agent, { kind: "post", title: "x".repeat(141) }), /too long/);
  });
  it("limits hook, body, networks and links", async () => {
    await bad(createContent(noDb, agent, { kind: "post", title: "t", hook: "h".repeat(301) }), /hook/);
    await bad(createContent(noDb, agent, { kind: "post", title: "t", body: "b".repeat(8001) }), /body/);
    await bad(createContent(noDb, agent, { kind: "post", title: "t", platforms: ["myspace" as never] }), /platforms/);
    await bad(
      createContent(noDb, agent, { kind: "post", title: "t", platforms: ["instagram", "tiktok", "youtube", "facebook", "linkedin", "instagram"] }),
      /too many networks/,
    );
    const many = Array.from({ length: 11 }, (_, i) => ({ label: `l${i}`, url: "https://a.example/x" }));
    await bad(createContent(noDb, agent, { kind: "post", title: "t", links: many }), /too many links/);
  });
  it("refuses unsafe links", async () => {
    for (const u of ["javascript:alert(1)", "http://a.example", "//evil.example", "data:text/html,x"])
      await bad(createContent(noDb, agent, { kind: "post", title: "t", links: [{ label: "x", url: u }] }), /https/);
  });
  it("refuses a bad schedule and a bad status", async () => {
    await bad(createContent(noDb, agent, { kind: "post", title: "t", scheduledFor: "soon" }), /scheduledFor/);
    await bad(createContent(noDb, agent, { kind: "post", title: "t", status: "approved" as never }), /status/);
  });
  it("research needs a source link", async () => {
    await bad(createContent(noDb, agent, { kind: "research", title: "t" }), /source link/);
    await bad(createContent(noDb, agent, { kind: "research", title: "t", links: [] }), /source link/);
    await bad(
      createContent(noDb, agent, { kind: "research", title: "t", links: [{ label: "s", url: "https://a.example" }], ask: true }),
      /Research isn't published/,
    );
  });
  it("an agent can never set approved or waiting, and unknown fields are refused", async () => {
    await bad(updateContent(noDb, agent, ID, { status: "approved" }), /Only your yes/);
    await bad(updateContent(noDb, owner, ID, { status: "approved" }), /Only your yes/);
    await bad(updateContent(noDb, agent, ID, { status: "waiting" }), /Ask for a yes/);
    await bad(updateContent(noDb, agent, ID, { kind: "post" } as never), /kind|nrecognized/i);
    await bad(updateContent(noDb, agent, "nope", { title: "x" }), /Unknown content/);
    await bad(updateContent(noDb, agent, ID, { publishedUrl: "http://a.example" }), /https/);
  });
});

describe("metric validation", () => {
  const row = { takenOn: "2026-11-01", network: "instagram", metric: "followers", value: 10 } as const;
  const rec = (patch: Record<string, unknown>) => recordMetrics(noDb, agent, [{ ...row, ...patch } as never]);
  it("refuses bad numbers", async () => {
    await bad(rec({ value: Number.NaN }), /Reading 1.*value/);
    await bad(rec({ value: Number.POSITIVE_INFINITY }), /value/);
    await bad(rec({ value: -1 }), /negative/);
    await bad(rec({ value: 1e12 + 1 }), /too large/);
    await bad(rec({ value: "12" }), /value/);
  });
  it("refuses bad names, networks and dates", async () => {
    await bad(rec({ metric: "Followers" }), /metric/);
    await bad(rec({ metric: "1abc" }), /metric/);
    await bad(rec({ metric: `a${"b".repeat(40)}` }), /metric/);
    await bad(rec({ network: "myspace" }), /network/);
    await bad(rec({ takenOn: "2026-13-40" }), /takenOn/);
    await bad(rec({ takenOn: "11/01/2026" }), /takenOn/);
    await bad(rec({ takenOn: "2999-01-01" }), /future/);
    await bad(rec({ contentId: "not-a-uuid" }), /contentId/);
  });
  it("allows at most 200 rows", async () => {
    await bad(
      recordMetrics(
        noDb,
        agent,
        Array.from({ length: 201 }, () => row as never),
      ),
      /max 200/,
    );
  });
});

describe("controls validation", () => {
  it("checks the budget and the round keys", async () => {
    await bad(saveControls(noDb, admin, { creditBudget: -1 }), /negative/);
    await bad(saveControls(noDb, admin, { creditBudget: 10001 }), /too large/);
    await bad(saveControls(noDb, admin, { creditBudget: 1.5 }), /whole number/);
    await bad(saveControls(noDb, admin, { rounds: { weekend: true } as never }), /nrecognized|weekend/i);
    await bad(saveControls(noDb, admin, { autonomous: "yes" as never }), /autonomous/);
  });
});

describe("strict dates for when and scheduledFor", () => {
  const HELP = /Give a time and time zone, e\.g\. 2026-11-30T09:00:00-08:00/;
  it("accepts an ISO date-time with a zone", () => {
    for (const ok of ["2026-11-30T09:00:00-08:00", "2026-11-30T18:00:00Z", "2026-11-30T18:00Z", "2026-11-30T18:00:00.250+05:30"])
      expect(isRealWhen(ok)).toBe(true);
  });
  it("refuses date-only, no zone, impossible dates and times", () => {
    for (const bad of [
      "2026-11-30",
      "2026-11-30T09:00:00",
      "2026-02-31T09:00:00Z",
      "2026-11-30T25:00:00Z",
      "2026-11-30T09:60:00Z",
      "tomorrow",
      "2026-11-30T09:00:00+99:00",
    ])
      expect(isRealWhen(bad)).toBe(false);
  });
  it("says what to give when a date has no time", async () => {
    await bad(createContent(noDb, agent, { kind: "post", title: "t", scheduledFor: "2026-11-30" }), HELP);
    await bad(createContent(noDb, agent, { kind: "post", title: "t", scheduledFor: "2026-02-31T09:00:00Z" }), HELP);
  });
});
