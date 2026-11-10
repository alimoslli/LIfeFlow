import { describe, expect, it } from "vitest";
import { NAME_KEY, SPLASH_SCRIPT, TZ_KEY } from "@/components/motion/splash";

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
    constructor() {
      super(instant.getTime());
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
    // 11 PM: the evening greeting, under the night sky (the moment picks which skyling rises on the opening screen)
    expect(out).toEqual({ greeting: "Good evening", name: "Alex", shown: true, moment: "star" });
    expect(runSplash({ [TZ_KEY]: "America/New_York" }, new Date("2026-11-05T17:30:00Z"), 23).greeting).toBe("Good afternoon");
    expect(runSplash({ [TZ_KEY]: "Asia/Tokyo" }, new Date("2026-11-05T17:30:00Z"), 17).greeting).toBe("Up late");
  });

  it("falls back to the device clock before the app has saved a zone, or if the saved one is invalid", () => {
    expect(runSplash({}, lateEveningLA, 7)).toMatchObject({ greeting: "Good morning", moment: "ray", shown: true });
    expect(runSplash({ [TZ_KEY]: "Not/AZone" }, lateEveningLA, 20).greeting).toBe("Good evening");
  });
});
