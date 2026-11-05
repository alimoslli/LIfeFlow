import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { greetingIn, todayIn } from "@/lib/dates";

// 11 PM on Thursday Nov 5 in Los Angeles: UTC is already 7 AM on Friday Nov 6 (audit A18).
const LA = "America/Los_Angeles";
const LATE = new Date("2026-11-06T07:00:00Z");

describe("the greeting follows the user's time zone, not the device or server clock", () => {
  it("says good evening at 11 PM in Los Angeles even where the clock reads 7 AM UTC", () => {
    expect(todayIn(LA, LATE)).toBe("2026-11-05");
    expect(greetingIn(LA, LATE)).toBe("Good evening");
    expect(greetingIn("UTC", LATE)).toBe("Good morning");
    expect(greetingIn(LA, new Date("2026-11-05T11:30:00Z"))).toBe("Up late"); // 3:30 AM
    expect(greetingIn(LA, new Date("2026-11-05T21:00:00Z"))).toBe("Good afternoon"); // 1 PM
  });

  it("the chat greeting doesn't read the device's hour", () => {
    const chat = readFileSync(path.resolve(import.meta.dirname, "../../src/components/jarvis/chat.tsx"), "utf8");
    expect(chat).not.toMatch(/\.getHours\(\)/);
    expect(chat).toMatch(/greetingIn\(tz/);
  });
});
