import { describe, expect, it } from "vitest";
import { companionOf, currentKey, isCompanionChoice, isCompanionKey, skylingAt, SKY_CHOICE, starGlowAt } from "@/lib/companions";
import { sunTimes } from "@/lib/day-clock";
import { minuteIn, resolveSkyling } from "@/lib/skyling-now";

// "Changes with the sky" (owner, 2026-11-10): whoever's moment it is; only the look follows the time.
describe("changes with the sky", () => {
  const rise = 7 * 60; // 7:00
  const set = 17 * 60; // 5:00 PM, so midday is noon

  // Owner, 2026-11-11: five, by the real sky: Dawn, Ray through the day, Goldie, Star from sunset, Moon from 9 PM.
  it("hands over at each boundary", () => {
    expect(skylingAt(rise - 71, rise, set)).toBe("moon");
    expect(skylingAt(rise - 70, rise, set)).toBe("dawn"); // first light: Moon turns into Dawn
    expect(skylingAt(rise + 44, rise, set)).toBe("dawn");
    expect(skylingAt(rise + 45, rise, set)).toBe("ray"); // the day
    expect(skylingAt(12 * 60, rise, set)).toBe("ray");
    expect(skylingAt(set - 91, rise, set)).toBe("ray");
    expect(skylingAt(set - 90, rise, set)).toBe("goldie"); // golden hour
    expect(skylingAt(set + 4, rise, set)).toBe("goldie");
    expect(skylingAt(set + 5, rise, set)).toBe("star"); // after sunset: Dusk turns into Star
    expect(skylingAt(21 * 60 - 1, rise, set)).toBe("star");
    expect(skylingAt(21 * 60, rise, set)).toBe("moon"); // 9 PM
  });

  it("wraps past midnight: Moon all the way to first light", () => {
    for (const m of [23 * 60, 23 * 60 + 59, 0, 1, 3 * 60, 1440, 1440 + 60, -30]) expect(skylingAt(m, rise, set)).toBe("moon");
  });

  it("follows the real sky on a winter and a summer day", () => {
    const winter = sunTimes("2026-12-21", "America/Chicago");
    const summer = sunTimes("2026-06-21", "America/Chicago");
    expect(summer.set - summer.rise).toBeGreaterThan(winter.set - winter.rise);
    // 7:45 AM is the day in June but still first light in December
    expect(skylingAt(7 * 60 + 45, summer.rise, summer.set)).toBe("ray");
    expect(skylingAt(7 * 60 + 45, winter.rise, winter.set)).toBe("dawn");
    // 5:30 PM is after sunset in December, still the day in June
    expect(skylingAt(17 * 60 + 30, winter.rise, winter.set)).toBe("star");
    expect(skylingAt(17 * 60 + 30, summer.rise, summer.set)).toBe("ray");
    // Moon waits for real dark: 9 PM in winter, two hours after sunset in summer
    expect(skylingAt(21 * 60, winter.rise, winter.set)).toBe("moon");
    expect(skylingAt(21 * 60, summer.rise, summer.set)).toBe("star");
    expect(skylingAt(summer.set + 120, summer.rise, summer.set)).toBe("moon");
    for (const t of [winter, summer]) expect(skylingAt(1 * 60, t.rise, t.set)).toBe("moon");
  });

  it("Star wears the last of the sunset for its first hour", () => {
    expect(starGlowAt(set + 4, set)).toBe(false);
    expect(starGlowAt(set + 5, set)).toBe(true);
    expect(starGlowAt(set + 64, set)).toBe(true);
    expect(starGlowAt(set + 65, set)).toBe(false);
  });

  it("keeps a choice saved before the cast became five: Noon is Ray, Dusk is Moon", () => {
    expect(companionOf("noon").key).toBe("ray");
    expect(companionOf("dusk").key).toBe("moon");
    expect(currentKey("dusk")).toBe("moon");
    expect(currentKey("nova")).toBeNull();
    expect(resolveSkyling("noon", "America/New_York")).toBe("ray");
  });

  it("resolves a saved choice: the one picked as it is, the sky by the time in their zone", () => {
    const at = new Date("2026-11-10T13:00:00Z"); // 8:00 AM in New York, 10:00 PM in Tokyo
    expect(minuteIn("America/New_York", at)).toBe(8 * 60);
    expect(resolveSkyling("goldie", "America/New_York", at)).toBe("goldie");
    expect(resolveSkyling(null, "America/New_York", at)).toBeNull();
    expect(resolveSkyling(SKY_CHOICE, "America/New_York", at)).toBe("ray");
    expect(resolveSkyling(SKY_CHOICE, "Asia/Tokyo", at)).toBe("moon");
  });

  it("is a choice, not a sixth skyling, and never breaks a lookup", () => {
    expect(isCompanionChoice(SKY_CHOICE)).toBe(true);
    expect(isCompanionKey(SKY_CHOICE)).toBe(false);
    expect(isCompanionChoice("nova")).toBe(false);
    expect(() => companionOf(SKY_CHOICE)).not.toThrow();
    expect(companionOf(SKY_CHOICE).key).toBe("ray");
  });
});
