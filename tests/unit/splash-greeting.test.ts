import { describe, expect, it } from "vitest";
import { NAME_KEY, SPLASH_SCRIPT, TZ_KEY } from "@/components/motion/splash";
import { localDateOf, localTimeOf } from "@/lib/dates";
import { sunTimes } from "@/lib/day-clock";
import { skylingAt } from "@/lib/companions";

/** Runs the real inline splash script against a fake page whose device clock reads `deviceHour`. */
function runSplash(stored: Record<string, string>, instant: Date, deviceHour: number) {
  const vars = new Map<string, string>();
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const document = {
    documentElement: {
      style: { setProperty: (k: string, v: string) => vars.set(k, JSON.parse(v)) },
      classList: { add: (c: string) => classes.add(c) },
      setAttribute: (k: string, v: string) => attrs.set(k, v),
    },
  };
  const localStorage = { getItem: (k: string) => stored[k] ?? null };
  const session = new Map<string, string>();
  const sessionStorage = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => session.set(k, v) };
  const matchMedia = () => ({ matches: false });
  const navigator = { webdriver: false };
  const location = { search: "" };
  class DeviceDate extends Date {
    // "now" is the test's instant; a date built from a value is that value
    constructor(...args: [] | [number]) {
      if (args.length) super(args[0]);
      else super(instant.getTime());
    }
    getHours() {
      return deviceHour;
    }
  }
  new Function("document", "localStorage", "sessionStorage", "matchMedia", "navigator", "location", "Date", SPLASH_SCRIPT)(
    document,
    localStorage,
    sessionStorage,
    matchMedia,
    navigator,
    location,
    DeviceDate,
  );
  return { greeting: vars.get("--lf-greet"), name: vars.get("--lf-name"), shown: classes.has("lf-splash"), moment: attrs.get("data-lf-moment") };
}

describe("splash greeting", () => {
  // 11 PM on Nov 5 in Los Angeles is 7 AM on Nov 6 in UTC.
  const lateEveningLA = new Date("2026-11-06T07:00:00Z");

  it("greets by the hour in the user's time zone, not the device clock", () => {
    const out = runSplash({ [TZ_KEY]: "America/Los_Angeles", [NAME_KEY]: "Alex" }, lateEveningLA, 7);
    // 11 PM: the evening greeting, under the night sky, and Moon rises (the moment picks which skyling rises on the opening screen)
    expect(out).toEqual({ greeting: "Good evening", name: "Alex", shown: true, moment: "moon" });
    expect(runSplash({ [TZ_KEY]: "America/New_York" }, new Date("2026-11-05T17:30:00Z"), 23).greeting).toBe("Good afternoon");
    expect(runSplash({ [TZ_KEY]: "Asia/Tokyo" }, new Date("2026-11-05T17:30:00Z"), 17).greeting).toBe("Up late");
  });

  it("falls back to the device clock before the app has saved a zone, or if the saved one is invalid", () => {
    expect(runSplash({}, lateEveningLA, 7)).toMatchObject({ greeting: "Good morning", moment: "ray", shown: true });
    expect(runSplash({ [TZ_KEY]: "Not/AZone" }, lateEveningLA, 20).greeting).toBe("Good evening");
  });

  it("shows the same skyling as Today: whoever's moment it is by the sun in the user's zone", () => {
    const zones = ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Australia/Sydney", "America/Chicago"];
    for (const tz of zones)
      for (let hour = 0; hour < 24; hour++)
        for (const minute of [5, 35]) {
          const at = new Date(Date.UTC(2026, 10, 5, hour, minute));
          const { rise, set } = sunTimes(localDateOf(at, tz), tz);
          const [h, m] = localTimeOf(at, tz).split(":").map(Number);
          expect(runSplash({ [TZ_KEY]: tz }, at, 0).moment, `${tz} ${at.toISOString()}`).toBe(skylingAt(h * 60 + m, rise, set));
        }
  });
});
