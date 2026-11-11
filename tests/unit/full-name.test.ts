import { describe, expect, it } from "vitest";
import { cleanFullName, FULL_NAME_MAX } from "@/lib/full-name";

describe("cleanFullName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanFullName("  Maya   Rose  Patel ")).toBe("Maya Rose Patel");
  });
  it("empty clears it", () => {
    expect(cleanFullName("")).toBeNull();
    expect(cleanFullName("   ")).toBeNull();
  });
  it("allows 120 characters and refuses more", () => {
    expect(cleanFullName("a".repeat(FULL_NAME_MAX))).toHaveLength(120);
    expect(() => cleanFullName("a".repeat(FULL_NAME_MAX + 1))).toThrow();
    expect(() => cleanFullName(" " + "a".repeat(FULL_NAME_MAX + 1))).toThrow();
  });
});
