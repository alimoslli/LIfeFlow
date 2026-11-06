import { describe, expect, it } from "vitest";
import { cleanLine, cleanText, HqError, isSafeLinkUrl, normalizeSessionId } from "@/server/services/hq";

describe("link urls", () => {
  it("accepts https and same-site paths", () => {
    for (const u of ["https://claude.ai/artifact/abc", "/admin/hq", "/admin/hq/approvals?x=1"]) expect(isSafeLinkUrl(u), u).toBe(true);
  });
  it("rejects everything else", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,x",
      "//evil.example",
      "/\\evil.example",
      "http://claude.ai",
      "https://",
      "ftp://x.y",
      "admin/hq",
      "",
      "/a b",
      "https://a.b/\n",
      " https://a.b",
    ])
      expect(isSafeLinkUrl(u), JSON.stringify(u)).toBe(false);
    expect(isSafeLinkUrl("https://a.b/" + "x".repeat(2000))).toBe(false);
  });
});

describe("text cleaning", () => {
  it("strips control characters and collapses a line", () => {
    expect(cleanLine("  Hello\u0000 \n\tworld‮ ")).toBe("Hello world");
    expect(cleanText("a\u0007b\r\nc\td ")).toBe("ab\nc\td");
  });
});

describe("session ids", () => {
  it("normalises cse_ to session_", () => {
    expect(normalizeSessionId("cse_01Mhcz6Ao4XdmNh3eAPYd3QN")).toBe("session_01Mhcz6Ao4XdmNh3eAPYd3QN");
    expect(normalizeSessionId("session_01Mhcz6Ao4XdmNh3eAPYd3QN")).toBe("session_01Mhcz6Ao4XdmNh3eAPYd3QN");
  });
  it("rejects bad ones", () => {
    for (const s of [
      "",
      "abc",
      "session_short",
      "session_" + "a".repeat(65),
      "other_01Mhcz6Ao4XdmNh3eAPYd3QN",
      "session_01Mhcz6Ao4-dmNh3eAPYd3QN",
      "session_01Mhcz6Ao4XdmNh3eAP\nx",
    ])
      expect(() => normalizeSessionId(s), s).toThrow(HqError);
  });
});

describe("header counts line", () => {
  it("keeps the order working, done, waiting, blocked, asleep, offline and hides zeros", async () => {
    const { countsLine } = await import("@/components/hq/labels");
    expect(countsLine({ working: 1, done: 1, waiting: 0, asleep: 1, blocked: 1, offline: 1 })).toBe("1 working · 1 done · 1 blocked · 1 asleep · 1 offline");
    expect(countsLine({ working: 0, done: 0, waiting: 0, asleep: 0, blocked: 0, offline: 0 })).toBe("");
  });
});
