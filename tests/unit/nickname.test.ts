import { describe, expect, it } from "vitest";
import { checkNickname } from "@/lib/nickname";

const ok = (s: string) => {
  const r = checkNickname(s);
  if (!r.ok) throw new Error(r.error);
  return r.nickname;
};
const bad = (s: string) => expect(checkNickname(s).ok).toBe(false);

describe("checkNickname", () => {
  it("accepts plain nicknames and the allowed punctuation", () => {
    expect(ok("Mo")).toBe("Mo");
    expect(ok("Night_Owl-7")).toBe("Night_Owl-7");
    expect(ok("O'Neil Jr.")).toBe("O'Neil Jr.");
    expect(ok("Zoë 42")).toBe("Zoë 42");
    expect(ok("a".repeat(16))).toBe("a".repeat(16));
  });
  it("trims and collapses extra spaces", () => {
    expect(ok("   Sky   Fan  ")).toBe("Sky Fan");
  });
  it("rejects emails, web addresses and phone-like digits", () => {
    bad("me@x.com");
    bad("a@b");
    bad("http://x");
    bad("www.cool");
    bad("cool.com");
    bad("my.site.io");
    bad("1234567");
    bad("555 123 4567");
    bad("555-123-4567");
    expect(ok("Room 123456")).toBe("Room 123456");
  });
  it("rejects bad lengths and characters", () => {
    bad("");
    bad("   ");
    bad("A");
    bad(" B ");
    bad("a".repeat(17));
    bad("no<script>");
    bad("emoji 😀");
    bad("semi;colon");
  });
});
