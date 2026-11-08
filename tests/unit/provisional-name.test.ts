import { describe, expect, it } from "vitest";
import { provisionalName } from "@/lib/provisional-name";

describe("provisionalName", () => {
  it("uses a first name made of letters", () => {
    expect(provisionalName("jordan.lee7@x.com")).toBe("Jordan");
    expect(provisionalName("MAYA_k@x.com")).toBe("Maya");
  });
  it("leaves it empty for handles that are not names", () => {
    expect(provisionalName("jdoe1234@x.com")).toBe("there");
    expect(provisionalName("1234@x.com")).toBe("there");
    expect(provisionalName("qa-abc123@example.com")).toBe("there");
    expect(provisionalName("admin@x.com")).toBe("there");
    expect(provisionalName("@x.com")).toBe("there");
  });
});
