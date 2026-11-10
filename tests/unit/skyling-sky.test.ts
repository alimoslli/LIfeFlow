import { describe, expect, it } from "vitest";
import { companionOf, isCompanionChoice, isCompanionKey, skylingAt, SKY_CHOICE } from "@/lib/companions";
import { sunTimes } from "@/lib/day-clock";
import { minuteIn, resolveSkyling } from "@/lib/skyling-now";

// "Changes with the sky" (owner, 2026-11-10): whoever's moment it is; only the look follows the time.
describe("changes with the sky", () => {
  const rise = 7 * 60; // 7:00
  const set = 17 * 60; // 5:00 PM, so midday is noon

  it("hands over at each boundary", () => {
    expect(skylingAt(rise - 71, rise, set)).toBe("star");
    expect(skylingAt(rise - 70, rise, set)).toBe("dawn"); // first light
    expect(skylingAt(rise + 44, rise, set)).toBe("dawn");
    expect(skylingAt(rise + 45, rise, set)).toBe("ray"); // morning
    expect(skylingAt(12 * 60 - 61, rise, set)).toBe("ray");
    expect(skylingAt(12 * 60 - 60, rise, set)).toBe("noon"); // an hour before midday
    expect(skylingAt(set - 91, rise, set)).toBe("noon");
    expect(skylingAt(set - 90, rise, set)).toBe("goldie"); // golden hour
    expect(skylingAt(set + 4, rise, set)).toBe("goldie");
    expect(skylingAt(set + 5, rise, set)).toBe("dusk"); // after sunset
    expect(skylingAt(set + 69, rise, set)).toBe("dusk");
    expect(skylingAt(set + 70, rise, set)).toBe("star"); // night
  });

  it("wraps past midnight: night all the way to first light", () => {
    for (const m of [23 * 60, 23 * 60 + 59, 0, 1, 3 * 60, 1440, 1440 + 60, -30]) expect(skylingAt(m, rise, set)).toBe("star");
  });

  it("follows the real sky on a winter and a summer day", () => {
    const winter = sunTimes("2026-12-21", "America/Chicago");
    const summer = sunTimes("2026-06-21", "America/Chicago");
    expect(summer.set - summer.rise).toBeGreaterThan(winter.set - winter.rise);
    // 7:45 AM is morning in June but still first light in December
    expect(skylingAt(7 * 60 + 45, summer.rise, summer.set)).toBe("ray");
    expect(skylingAt(7 * 60 + 45, winter.rise, winter.set)).toBe("dawn");
    // 5:30 PM is after sunset in December, golden hour or midday light in June
    expect(skylingAt(17 * 60 + 30, winter.rise, winter.set)).toBe("dusk");
    expect(["noon", "goldie"]).toContain(skylingAt(17 * 60 + 30, summer.rise, summer.set));
    for (const t of [winter, summer]) expect(skylingAt(1 * 60, t.rise, t.set)).toBe("star");
  });

  it("resolves a saved choice: the one picked as it is, the sky by the time in their zone", () => {
    const at = new Date("2026-11-10T13:00:00Z"); // 8:00 AM in New York, 10:00 PM in Tokyo
    expect(minuteIn("America/New_York", at)).toBe(8 * 60);
    expect(resolveSkyling("goldie", "America/New_York", at)).toBe("goldie");
    expect(resolveSkyling(null, "America/New_York", at)).toBeNull();
    expect(resolveSkyling(SKY_CHOICE, "America/New_York", at)).toBe("ray");
    expect(resolveSkyling(SKY_CHOICE, "Asia/Tokyo", at)).toBe("star");
  });

  it("is a choice, not a seventh skyling, and never breaks a lookup", () => {
    expect(isCompanionChoice(SKY_CHOICE)).toBe(true);
    expect(isCompanionKey(SKY_CHOICE)).toBe(false);
    expect(isCompanionChoice("nova")).toBe(false);
    expect(() => companionOf(SKY_CHOICE)).not.toThrow();
    expect(companionOf(SKY_CHOICE).key).toBe("ray");
  });
});
