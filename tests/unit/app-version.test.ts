import { describe, expect, it } from "vitest";
import { updateDecision } from "@/lib/app-version";

describe("an open app keeps itself on the live version", () => {
  it("does nothing when it is current, or when either side doesn't know its build", () => {
    expect(updateDecision("abc", "abc", null)).toBe("current");
    expect(updateDecision("", "abc", null)).toBe("current"); // a local build
    expect(updateDecision("abc", "", null)).toBe("current");
    expect(updateDecision("abc", null, null)).toBe("current");
    expect(updateDecision("abc", undefined, "abc")).toBe("current");
  });

  it("reloads once when it is behind, and never loops if the reload didn't get it there", () => {
    expect(updateDecision("old", "new", null)).toBe("reload");
    expect(updateDecision("old", "new", "older")).toBe("reload"); // an earlier build's mark doesn't count
    expect(updateDecision("old", "new", "new")).toBe("stuck");
  });
});
