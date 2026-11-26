import { describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { cleanDates } from "@/server/services/school-dates";
import { longDays } from "@/server/services/proactive/sunday";

const TZ = "America/New_York";
const at = (d: string, t: string) => localToInstant(d, t, TZ);

describe("school admin dates (gamechanger 6)", () => {
  const cited = [{ url: "https://valenciacollege.edu/academics/calendar/", title: "Academic calendar" }];
  it("keeps only exact future dates from a cited page, soonest first", () => {
    const out = cleanDates(
      {
        dates: [
          { what: "Spring registration opens", date: "2026-12-01", url: "https://www.valenciacollege.edu/academics/calendar/" },
          { what: "Withdrawal deadline", date: "2026-11-27", url: "https://valenciacollege.edu/academics/calendar/" },
          { what: "Already passed", date: "2026-10-01", url: "https://valenciacollege.edu/academics/calendar/" },
          { what: "Made-up page", date: "2026-12-05", url: "https://example.com/x" },
          { what: "Vague", date: "early December", url: "https://valenciacollege.edu/academics/calendar/" },
        ],
      },
      cited,
      "2026-11-26",
    );
    expect(out.map((d) => [d.what, d.date])).toEqual([
      ["Withdrawal deadline", "2026-11-27"],
      ["Spring registration opens", "2026-12-01"],
    ]);
    expect(out[0].source.url).toBe(cited[0].url);
  });
  it("survives a broken answer", () => {
    expect(cleanDates(null, cited, "2026-11-26")).toEqual([]);
  });
});

describe("Sunday's learned suggestion (gamechanger 7)", () => {
  const shift = (d: string, lateMin: number | null) => ({
    startsAt: at(d, "17:00"),
    endsAt: at(d, "22:00"),
    recordedEnd: lateMin == null ? null : new Date(at(d, "22:00").getTime() + lateMin * 60_000),
  });
  it("finds a weekday whose real clock-outs keep running long, rounding the overrun down", () => {
    const tuesdays = [shift("2026-11-03", 42), shift("2026-11-10", 0), shift("2026-11-17", 38)];
    const out = longDays(tuesdays, TZ);
    expect(out.get(2)).toEqual({ long: 2, worked: 3, typicalMin: 35 });
  });
  it("never from scheduled times alone, and not from one long night", () => {
    expect(longDays([shift("2026-11-03", null), shift("2026-11-10", null), shift("2026-11-17", null)], TZ).size).toBe(0);
    expect(longDays([shift("2026-11-03", 60), shift("2026-11-10", 0), shift("2026-11-17", 0)], TZ).size).toBe(0);
  });
});
