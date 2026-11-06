import { describe, expect, it } from "vitest";
import { buildRequest, isoWhen, parseArgs } from "../../scripts/hq";

const S = { sessionId: "session_01Mhcz6BYyF8TLLXwBiWcWyk" };
const build = (cmd: string, argv: string[], extra: Parameters<typeof buildRequest>[2] = S) => buildRequest(cmd, parseArgs(argv), extra);

describe("hq cli: content", () => {
  it("content add builds the body with repeats, links, a body file and the chat id", () => {
    const r = build(
      "content add",
      [
        "content",
        "add",
        "--kind",
        "script",
        "--title",
        "Week one",
        "--hook",
        "You paid for it twice",
        "--platform",
        "instagram",
        "--platform",
        "tiktok",
        "--when",
        "2026-11-12T18:00:00Z",
        "--link",
        "Storyboard=https://claude.ai/a",
        "--link",
        "https://a.example/b",
        "--ask",
        "--body-file",
        "script.txt",
      ],
      { ...S, readFile: (f) => `contents of ${f}` },
    );
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/api/hq/report");
    expect(r.body).toMatchObject({
      type: "content",
      kind: "script",
      title: "Week one",
      hook: "You paid for it twice",
      body: "contents of script.txt",
      platforms: ["instagram", "tiktok"],
      scheduledFor: "2026-11-12T18:00:00Z",
      links: [{ label: "Storyboard", url: "https://claude.ai/a" }, { url: "https://a.example/b" }],
      ask: true,
      sessionId: S.sessionId,
    });
  });
  it("content add takes --body inline and omits optional fields", () => {
    const r = build("content add", ["content", "add", "--kind", "concept", "--title", "T", "--body", "Hello"]);
    expect(r.body).toEqual({ type: "content", kind: "concept", title: "T", body: "Hello", sessionId: S.sessionId });
  });
  it("content add refuses a missing title, a bad kind and a bad date", () => {
    expect(() => build("content add", ["content", "add", "--kind", "post"])).toThrow(/--title/);
    expect(() => build("content add", ["content", "add", "--kind", "meme", "--title", "T"])).toThrow(/--kind/);
    expect(() => build("content add", ["content", "add", "--kind", "post", "--title", "T", "--when", "tomorrow"])).toThrow(/--when/);
    expect(() => isoWhen("2026-11-12")).not.toThrow();
  });
  it("content update maps the flags", () => {
    const r = build("content update", [
      "content",
      "update",
      "abc",
      "--status",
      "scheduled",
      "--external-id",
      "mc_123",
      "--published-url",
      "https://i.example/p",
      "--when",
      "2026-11-12T18:00:00Z",
    ]);
    expect(r.body).toEqual({
      type: "content",
      id: "abc",
      status: "scheduled",
      externalId: "mc_123",
      publishedUrl: "https://i.example/p",
      scheduledFor: "2026-11-12T18:00:00Z",
      sessionId: S.sessionId,
    });
    expect(() => build("content update", ["content", "update"])).toThrow(/Usage/);
  });
});

describe("hq cli: metrics", () => {
  it("builds one row per --metric", () => {
    const r = build("metrics", [
      "metrics",
      "--network",
      "instagram",
      "--date",
      "2026-11-05",
      "--metric",
      "followers=123",
      "--metric",
      "reach=456.5",
      "--content",
      "cid",
    ]);
    expect(r.body).toEqual({
      type: "metrics",
      rows: [
        { takenOn: "2026-11-05", network: "instagram", metric: "followers", value: 123, contentId: "cid" },
        { takenOn: "2026-11-05", network: "instagram", metric: "reach", value: 456.5, contentId: "cid" },
      ],
    });
  });
  it("refuses a value that is not a number", () => {
    for (const m of ["followers", "followers=", "followers=abc", "=5", "followers=Infinity"])
      expect(() => build("metrics", ["metrics", "--network", "instagram", "--date", "2026-11-05", "--metric", m]), m).toThrow(/--metric/);
    expect(() => build("metrics", ["metrics", "--network", "instagram", "--date", "2026-11-05"])).toThrow(/--metric/);
    expect(() => build("metrics", ["metrics", "--date", "2026-11-05", "--metric", "a=1"])).toThrow(/--network/);
  });
  it("reads rows from a file, as a list or { rows }", () => {
    const rows = [{ takenOn: "2026-11-05", network: "instagram", metric: "reach", value: 1 }];
    expect(build("metrics", ["metrics", "--file", "r.json"], { readFile: () => JSON.stringify(rows) }).body).toEqual({ type: "metrics", rows });
    expect(build("metrics", ["metrics", "--file", "r.json"], { readFile: () => JSON.stringify({ rows }) }).body).toEqual({ type: "metrics", rows });
    expect(() => build("metrics", ["metrics", "--file", "r.json"], { readFile: () => "{nope" })).toThrow(/JSON/);
    expect(() => build("metrics", ["metrics", "--file", "r.json"], { readFile: () => "{}" })).toThrow(/list/);
  });
});
