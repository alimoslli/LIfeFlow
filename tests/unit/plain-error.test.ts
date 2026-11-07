import { describe, expect, it } from "vitest";
import { plainMessage } from "@/lib/plain-error";

describe("only the app's own words reach people", () => {
  it("replaces browser and server leftovers", () => {
    for (const raw of [
      "Load failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "TypeError: x is not a function",
      "Internal error",
      "Request failed (502)",
      "",
      undefined,
    ])
      expect(plainMessage(raw, "Calm.")).toBe("Calm.");
  });
  it("keeps sentences the app wrote", () => {
    expect(plainMessage("Microphone access was blocked. Allow it in your browser settings to talk.", "Calm.")).toContain("Microphone");
    expect(plainMessage("You've used today's 5 free messages.", "Calm.")).toContain("free messages");
  });
});
