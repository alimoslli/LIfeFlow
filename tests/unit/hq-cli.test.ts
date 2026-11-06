import { describe, expect, it } from "vitest";
import { buildRequest, parseArgs, parseLink, parseUsageFile, safeHqBase, sessionIdFromEnv } from "../../scripts/hq";

describe("hq cli parsing", () => {
  it("parses flags, = form, bare flags and repeats", () => {
    const p = parseArgs(["mission", "add", "--role", "developer", "--title=Fix it", "--quiet", "--link", "a=https://x.y", "--link", "/admin/hq"]);
    expect(p.positional).toEqual(["mission", "add"]);
    expect(p.flags.role).toEqual(["developer"]);
    expect(p.flags.title).toEqual(["Fix it"]);
    expect(p.flags.quiet).toEqual(["true"]);
    expect(p.flags.link).toEqual(["a=https://x.y", "/admin/hq"]);
  });
  it("parses links", () => {
    expect(parseLink("Concepts=https://claude.ai/a?x=1")).toEqual({ label: "Concepts", url: "https://claude.ai/a?x=1" });
    expect(parseLink("https://claude.ai/a?x=1").url).toBe("https://claude.ai/a?x=1");
    expect(parseLink("/admin/hq").url).toBe("/admin/hq");
  });
  it("builds requests", () => {
    const add = buildRequest("mission add", parseArgs(["mission", "add", "--role", "marketing", "--title", "T", "--priority", "high", "--due", "2026-12-01"]));
    expect(add.body).toMatchObject({ type: "mission", role: "marketing", title: "T", priority: "high", dueOn: "2026-12-01" });
    const upd = buildRequest("mission update", parseArgs(["mission", "update", "abc", "--status", "blocked", "--blocked", "No credits"]));
    expect(upd.body).toMatchObject({ type: "mission", id: "abc", status: "blocked", blockedReason: "No credits" });
    expect(buildRequest("inbox", parseArgs(["inbox", "--role", "designer"])).path).toBe("/api/hq/inbox?role=designer");
    expect(() => buildRequest("approval", parseArgs(["approval", "--role", "developer"]))).toThrow(/Missing --kind/);
    expect(() => buildRequest("nope", parseArgs(["nope"]))).toThrow(/Unknown command/);
    expect(() => buildRequest("checkin", parseArgs(["checkin", "--status", "dancing"]), { sessionId: "session_x" })).toThrow(/status/);
  });
  it("builds a check-in with usage and phase", () => {
    const r = buildRequest("checkin", parseArgs(["checkin", "--status", "idle", "--phase", "round_end", "--needs", "A yes"]), {
      sessionId: "session_01Mhcz6Ao4XdmNh3eAPYd3QN",
      branch: "main",
      usage: { sevenDayPct: 31 },
    });
    expect(r.body).toMatchObject({ type: "checkin", status: "idle", needsAction: "A yes", branch: "main", usage: { sevenDayPct: 31, phase: "round_end" } });
  });
  it("reads the session id from CLAUDE_CODE_REMOTE_SDK_URL", () => {
    expect(sessionIdFromEnv({ CLAUDE_CODE_REMOTE_SDK_URL: "wss://api.example.com/v1/sessions/cse_01Mhcz6Ao4XdmNh3eAPYd3QN" })).toBe(
      "session_01Mhcz6Ao4XdmNh3eAPYd3QN",
    );
    expect(sessionIdFromEnv({ CLAUDE_CODE_REMOTE_SDK_URL: "https://x/v1/code/sessions/cse_01Mhcz6Ao4XdmNh3eAPYd3QN/events" })).toBe(
      "session_01Mhcz6Ao4XdmNh3eAPYd3QN",
    );
    expect(sessionIdFromEnv({})).toBeNull();
    expect(sessionIdFromEnv({ CLAUDE_CODE_REMOTE_SDK_URL: "https://x/nothing" })).toBeNull();
  });
});

describe("usage file", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const file = (savedAt: number) =>
    JSON.stringify({ saved_at: savedAt, five_hour: { used_percentage: 23 }, seven_day: { used_percentage: 31, resets_at: 1794800000 } });
  it("parses a fresh file", () => {
    expect(parseUsageFile(file(now / 1000 - 60), now)).toEqual({
      fiveHourPct: 23,
      sevenDayPct: 31,
      sevenDayResetsAt: new Date(1794800000_000).toISOString(),
      readAt: new Date(now - 60_000).toISOString(),
    });
  });
  it("rejects old, future, malformed and empty files", () => {
    expect(parseUsageFile(file(now / 1000 - 6 * 3600 - 1), now)).toBeNull();
    expect(parseUsageFile(file(now / 1000 + 7200), now)).toBeNull();
    expect(parseUsageFile("nope", now)).toBeNull();
    expect(parseUsageFile(JSON.stringify({ saved_at: now / 1000 }), now)).toBeNull();
    expect(parseUsageFile(JSON.stringify({ five_hour: { used_percentage: 1 } }), now)).toBeNull();
  });
});

describe("HQ_URL safety", () => {
  it("only allows https, or http to this machine", () => {
    expect(safeHqBase("https://lifeflow.example/")).toBe("https://lifeflow.example");
    expect(safeHqBase("http://localhost:3000")).toBe("http://localhost:3000");
    expect(safeHqBase("http://127.0.0.1:3100/")).toBe("http://127.0.0.1:3100");
    expect(safeHqBase("http://lifeflow.example")).toBeNull();
    expect(safeHqBase("http://localhost.evil.com")).toBeNull();
    expect(safeHqBase("ftp://x")).toBeNull();
    expect(safeHqBase("nope")).toBeNull();
    expect(safeHqBase(undefined)).toBeNull();
  });
});
