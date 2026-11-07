import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextRoundAt, nextWake, onDuty, ROUND_SCHEDULE, roundOf, wakeLine } from "@/server/hq/rounds";
import { EMPLOYEES } from "@/server/hq/team";

const LA = "America/Los_Angeles";

describe("the round schedule (owner, 2026-11-07: rounds run on their schedule only)", () => {
  it("matches the scheduled tasks in docs/hq/round-prompts.md, line for line", () => {
    const doc = readFileSync("docs/hq/round-prompts.md", "utf8");
    const crons = [...doc.matchAll(/^Cron: `([^`]+)`/gm)].map((m) => m[1]);
    expect(crons).toEqual(ROUND_SCHEDULE.map((r) => r.cron));
    for (const r of ROUND_SCHEDULE) {
      // The cron line says the same minute, hour and days as the fields HQ uses.
      const [, min, hour, , , days] = r.cron.split(" ");
      expect(Number(min)).toBe(r.minute);
      const range = /^(\d+)-(\d+)\/(\d+)$/.exec(hour);
      const hours = range ? Array.from({ length: Math.floor((+range[2] - +range[1]) / +range[3]) + 1 }, (_, i) => +range[1] + i * +range[3]) : [Number(hour)];
      expect(hours).toEqual(r.hours);
      expect(days === "*" ? [0, 1, 2, 3, 4, 5, 6] : days.split(",").map(Number)).toEqual(r.days);
    }
  });
  it("puts every department with no chat of its own in a round, and the COO in all of them", () => {
    for (const e of EMPLOYEES.filter((x) => !x.ownChat))
      expect(
        ROUND_SCHEDULE.some((r) => r.roles.includes(e.role)),
        e.role,
      ).toBe(true);
    for (const r of ROUND_SCHEDULE) expect(r.roles).toContain("assistant");
  });
  it("finds the next start in Pacific time, across days and daylight saving", () => {
    const night = ROUND_SCHEDULE.find((r) => r.kind === "night")!;
    // Saturday 2026-11-07 noon Pacific -> Sunday 3:07 AM Pacific (PST, -08:00).
    expect(nextRoundAt(night, new Date("2026-11-07T20:00:00Z")).toISOString()).toBe("2026-11-08T11:07:00.000Z");
    // Exactly at the start: the next one, not this one.
    expect(nextRoundAt(night, new Date("2026-11-08T11:07:00Z")).toISOString()).toBe("2026-11-10T11:07:00.000Z");
    // Summer (PDT, -07:00): Thursday 2026-07-02 3:07 AM.
    expect(nextRoundAt(night, new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-02T10:07:00.000Z");
  });
  it("says when each department wakes, in the owner's time zone", () => {
    const sat = new Date("2026-11-07T20:00:00Z");
    expect(wakeLine(nextWake("qa", sat)!.at, LA)).toBe("Wakes Sun 3:07 AM");
    expect(nextWake("marketing", sat)).toMatchObject({ round: { kind: "marketing" } });
    expect(wakeLine(nextWake("marketing", sat)!.at, LA)).toBe("Wakes Wed 3:41 AM");
    // Research works in the night round (situations) and its own Monday round: the sooner one.
    expect(nextWake("researcher", sat)!.round.kind).toBe("night");
    expect(wakeLine(nextWake("researcher", new Date("2026-11-08T12:00:00Z"))!.at, LA)).toBe("Wakes Mon 3:23 AM");
    expect(wakeLine(nextWake("assistant", sat)!.at, "America/New_York")).toBe("Wakes Sat 3:13 PM"); // the COO's next pass, 12:13 PM Pacific
    // Product & Design has no round: it works with the owner in its chat.
    expect(nextWake("designer", sat)).toBeNull();
  });
  it("reads which round is running from the COO's summary, or the time", () => {
    const tue = new Date("2026-11-10T11:10:00Z"); // Tuesday 3:10 AM Pacific
    expect(roundOf("Night round started", tue)?.kind).toBe("night");
    expect(roundOf("Research round started", tue)?.kind).toBe("research");
    expect(roundOf("Marketing round started", tue)?.kind).toBe("marketing");
    expect(roundOf("Pass started", tue)?.kind).toBe("pass");
    expect(roundOf(null, tue)?.kind).toBe("night");
    expect(roundOf("started", new Date("2026-11-11T11:45:00Z"))?.kind).toBe("marketing");
    expect(roundOf(null, new Date("2026-11-13T12:00:00Z"))).toBeNull(); // Friday 4 AM: no round
    // In the day, an unnamed check-in is a pass (never a night round).
    expect(roundOf(null, new Date("2026-11-10T22:15:00Z"))?.kind).toBe("pass"); // Tuesday 2:15 PM
    expect(roundOf("passing through", tue)?.kind).toBe("night"); // "pass" must be a word
  });

  it("the COO's pass runs every 2 hours from 8 AM to 10 PM, and only the COO works in it", () => {
    const pass = ROUND_SCHEDULE.find((r) => r.kind === "pass")!;
    expect(pass.roles).toEqual(["assistant"]);
    // Friday 7:45 PM Pacific -> 8:13 PM; 10:30 PM -> 8:13 AM the next day.
    expect(nextRoundAt(pass, new Date("2026-11-07T03:45:00Z")).toISOString()).toBe("2026-11-07T04:13:00.000Z");
    expect(nextRoundAt(pass, new Date("2026-11-07T06:30:00Z")).toISOString()).toBe("2026-11-07T16:13:00.000Z");
    // The COO's next wake is the sooner of the pass and the night round.
    expect(nextWake("assistant", new Date("2026-11-08T10:00:00Z"))!.round.kind).toBe("night"); // Sun 2 AM -> 3:07 AM
    expect(nextWake("assistant", new Date("2026-11-08T12:00:00Z"))!.round.kind).toBe("pass"); // Sun 4 AM -> 8:13 AM
    expect(nextWake("qa", new Date("2026-11-08T12:00:00Z"))!.round.kind).toBe("night"); // departments never wake for a pass
  });

  it("is on duty from 8 AM to 11 PM in the owner's time zone", () => {
    expect(onDuty(new Date("2026-11-07T15:59:00Z"), LA)).toBe(false); // 7:59 AM
    expect(onDuty(new Date("2026-11-07T16:00:00Z"), LA)).toBe(true); // 8:00 AM
    expect(onDuty(new Date("2026-11-08T06:59:00Z"), LA)).toBe(true); // 10:59 PM
    expect(onDuty(new Date("2026-11-08T07:00:00Z"), LA)).toBe(false); // 11:00 PM
    expect(onDuty(new Date("2026-11-08T07:00:00Z"), "America/New_York")).toBe(false); // 2 AM there
  });
});
