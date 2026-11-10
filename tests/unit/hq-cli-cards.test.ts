import { describe, expect, it } from "vitest";
import { buildRequest, inboxSummary, parseArgs, parsePreviewArg, previewContentType } from "../../scripts/hq";
import { runningLine } from "@/server/hq/running-line";
import { commitUrlOf, sinceFrom } from "@/server/services/hq-summary";
import { sniffImage } from "@/server/services/hq-files";

const FULL = [
  "approval",
  "--role",
  "designer",
  "--kind",
  "design",
  "--title",
  "Make Goals one calm list",
  "--why",
  "Students could not find where to add a goal.",
  "--change",
  "Goals and Habits become one list",
  "--change",
  "The Habits tab leaves Plan",
  "--on-yes",
  "Tonight Product builds it; tomorrow you get pictures.",
  "--on-no",
  "Nothing changes.",
  "--effort",
  "small",
  "--risk",
  "Low",
  "--recommend",
  "Yes.",
  "--preview",
  "shots/today.png:Today",
  "--preview",
  "shots/after.webp:If you say yes",
];

describe("hq approval flags (decision cards)", () => {
  it("builds a full card with repeated changes and uploaded previews", () => {
    const uploaded = { "shots/today.png": "11111111-1111-4111-8111-111111111111", "shots/after.webp": "22222222-2222-4222-8222-222222222222" };
    const r = buildRequest("approval", parseArgs(FULL), { uploaded });
    expect(r.path).toBe("/api/hq/report");
    expect(r.body).toMatchObject({
      type: "approval",
      role: "designer",
      kind: "design",
      title: "Make Goals one calm list",
      why: "Students could not find where to add a goal.",
      changes: ["Goals and Habits become one list", "The Habits tab leaves Plan"],
      onYes: "Tonight Product builds it; tomorrow you get pictures.",
      onNo: "Nothing changes.",
      effort: "small",
      risk: "Low",
      recommendation: "Yes.",
      previews: [
        { fileId: uploaded["shots/today.png"], label: "Today" },
        { fileId: uploaded["shots/after.webp"], label: "If you say yes" },
      ],
    });
  });
  it("refuses a preview that was not uploaded", () => {
    expect(() => buildRequest("approval", parseArgs(FULL), { uploaded: {} })).toThrow(/not uploaded/);
  });
  it("builds a revision with --revise and --changed", () => {
    const r = buildRequest(
      "approval",
      parseArgs(["approval", "--revise", "abc", "--changed", "Habits now sit inside each goal", "--title", "T", "--why", "W"]),
    );
    expect(r.body).toMatchObject({ type: "approval", revise: "abc", changedSinceNote: "Habits now sit inside each goal", title: "T", why: "W" });
    expect(r.body).not.toHaveProperty("role");
  });
  it("links a mission after a yes", () => {
    expect(buildRequest("approval", parseArgs(["approval", "--start", "a1", "--mission", "m1"])).body).toMatchObject({
      type: "approval",
      link: "a1",
      missionId: "m1",
    });
    expect(() => buildRequest("approval", parseArgs(["approval", "--start", "a1"]))).toThrow(/Missing --mission/);
  });
  it("sends the card with a publish ask on content add", () => {
    const r = buildRequest("content add", parseArgs(["content", "add", "--kind", "post", "--title", "P", "--ask", "--why", "W", "--preview", "a.png"]), {
      uploaded: { "a.png": "33333333-3333-4333-8333-333333333333" },
    });
    expect(r.body).toMatchObject({ ask: true, request: { why: "W", previews: [{ fileId: "33333333-3333-4333-8333-333333333333" }] } });
  });
  it("parses preview arguments", () => {
    expect(parsePreviewArg("a/b.png:Today: now")).toEqual({ path: "a/b.png", label: "Today: now" });
    expect(parsePreviewArg("x.JPG")).toEqual({ path: "x.JPG", label: null });
    expect(() => parsePreviewArg("x.gif")).toThrow(/png, jpeg or webp/);
    expect(previewContentType("a.webp")).toBe("image/webp");
  });
  it("prints what an agent must act on from the inbox", () => {
    const lines = inboxSummary({
      revisions: [{ id: "a", threadId: "t", version: 1, title: "Goals", decisionNote: "no two lists" }],
      needsRewrite: [{ id: "b", title: "Old" }],
      approvedWithoutMission: [{ id: "c", title: "Yes thing" }],
    });
    expect(lines[0]).toMatch(/REVISION ASKED.*no two lists.*--revise t/);
    expect(lines[1]).toMatch(/NEEDS REWRITE.*Old/);
    expect(lines[2]).toMatch(/--start c/);
  });
});

describe("hq decision-card helpers", () => {
  it("reads the picture type from the bytes", () => {
    expect(sniffImage(Buffer.from("89504e470d0a1a0a00", "hex"))).toBe("image/png");
    expect(sniffImage(Buffer.from("ffd8ffe0", "hex"))).toBe("image/jpeg");
    expect(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImage(Buffer.from("GIF89a....."))).toBeNull();
    expect(sniffImage(Buffer.from("<svg xmlns=...>"))).toBeNull();
  });
  it("words the running line from real counts and leaves out what failed", () => {
    expect(runningLine({})).toBeNull();
    expect(runningLine({ errors: { kinds: 0, hits: 0 }, signups: { new24h: 1, new7d: 4 }, notSetUp: ["Payments (Stripe)"] })).toBe(
      "No errors in the last 24 hours. 1 sign-up in the last 24 hours, 4 in 7 days. Not set up yet: Payments (Stripe).",
    );
    expect(runningLine({ errors: { kinds: 2, hits: 5 } })).toBe("5 errors in the last 24 hours (2 kinds).");
    // Many services not set up: a count, never a long list (the list is on App › Health).
    expect(runningLine({ notSetUp: ["Banks (Plaid)", "Payments (Stripe)"] })).toBe("Not set up yet: Banks (Plaid) and Payments (Stripe).");
    expect(runningLine({ notSetUp: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] })).toBe("9 services aren't set up yet.");
  });
  it("starts the window at the cookie, else 7 days, never in the future or before 30 days", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const day = 86_400_000;
    expect(sinceFrom(undefined, now).getTime()).toBe(now.getTime() - 7 * day);
    expect(sinceFrom("garbage", now).getTime()).toBe(now.getTime() - 7 * day);
    expect(sinceFrom(String(now.getTime() + 1000), now).getTime()).toBe(now.getTime() - 7 * day);
    expect(sinceFrom(String(now.getTime() - 2 * day), now).getTime()).toBe(now.getTime() - 2 * day);
    expect(sinceFrom(String(now.getTime() - 90 * day), now).getTime()).toBe(now.getTime() - 30 * day);
  });
  it("finds a commit link", () => {
    expect(
      commitUrlOf([
        { label: "Doc", url: "https://a.example/x" },
        { label: "Commit", url: "https://github.com/o/r/commit/abc" },
      ]),
    ).toBe("https://github.com/o/r/commit/abc");
    expect(commitUrlOf([{ label: "Doc", url: "/admin/work" }])).toBeNull();
  });
});
