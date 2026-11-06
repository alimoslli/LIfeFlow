import { describe, expect, it } from "vitest";
import { buildRequest, parseArgs } from "../../scripts/hq";

const build = (argv: string[], extra = {}) =>
  buildRequest(argv[0] === "mission" || argv[0] === "content" ? `${argv[0]} ${argv[1]}` : argv[0], parseArgs(argv), extra);
const OWN = { sessionId: "session_01OWNOWNOWNOWN", branch: "main", commit: "abc123", usage: { sevenDayPct: 12 } };

describe("hq cli: company commands", () => {
  it("brief takes --text or --file and an optional whole --needs", () => {
    expect(build(["brief", "--text", "Good round", "--needs", "2"]).body).toEqual({ type: "brief", body: "Good round", needsYou: 2 });
    expect(build(["brief", "--file", "b.md"], { readFile: () => "From file" }).body).toEqual({ type: "brief", body: "From file" });
    expect(() => build(["brief"])).toThrow(/Usage: brief/);
    expect(() => build(["brief", "--text", "x", "--needs", "many"])).toThrow(/--needs/);
    expect(() => build(["brief", "--text", "x", "--needs", "1000"])).toThrow(/--needs/);
    expect(() => build(["brief", "--text", "x", "--needs", "1.5"])).toThrow(/--needs/);
  });
  it("activity can be a decision", () => {
    expect(build(["activity", "--role", "assistant", "--text", "Decided: a", "--kind", "decision"]).body).toMatchObject({ kind: "decision" });
    expect((build(["activity", "--role", "assistant", "--text", "t"]).body as Record<string, unknown>).kind).toBeUndefined();
    expect(() => build(["activity", "--role", "assistant", "--text", "t", "--kind", "boss"])).toThrow(/--kind/);
  });
  it("errors is a GET", () => {
    expect(build(["errors"])).toMatchObject({ method: "GET", path: "/api/hq/errors" });
  });
  it("checkin --session relays another chat and leaves out branch, commit and usage", () => {
    const own = build(["checkin", "--status", "working"], OWN).body as Record<string, unknown>;
    expect(own).toMatchObject({ sessionId: "session_01OWNOWNOWNOWN", branch: "main", commit: "abc123", usage: { sevenDayPct: 12 } });
    const relay = build(["checkin", "--session", "cse_01Mhcz6BYyF8TLLXwBiWcWyk", "--status", "blocked", "--needs", "Wants a yes"], OWN).body as Record<
      string,
      unknown
    >;
    expect(relay).toMatchObject({ sessionId: "session_01Mhcz6BYyF8TLLXwBiWcWyk", status: "blocked", needsAction: "Wants a yes" });
    expect(relay.branch).toBeUndefined();
    expect(relay.commit).toBeUndefined();
    expect(relay.usage).toBeUndefined();
    expect((build(["checkin", "--session", "session_01Mhcz6BYyF8TLLXwBiWcWyk"], {}).body as Record<string, unknown>).sessionId).toBe(
      "session_01Mhcz6BYyF8TLLXwBiWcWyk",
    );
    expect(() => build(["checkin", "--session", "nope"], OWN)).toThrow(/--session/);
    expect(() => build(["checkin", "--session"], OWN)).toThrow(/--session/);
  });
});
