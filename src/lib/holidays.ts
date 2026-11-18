/**
 * Public holidays in the United States, worked out from the calendar (no feed, nothing guessed): the federal days and
 * Thanksgiving (owner, 2026-11-18, from a test student who couldn't tell whether next week was Thanksgiving break).
 * Only for someone whose time zone is a US one; a school's own break comes from the school's calendar feed when it has
 * one, and nothing here pretends to know it.
 */
const US_ZONES =
  /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Yakutat|Nome|Metlakatla|Adak|Boise|Detroit|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+|Puerto_Rico)|Pacific\/Honolulu|US\/.+)$/;

export const usesUsHolidays = (tz: string) => US_ZONES.test(tz);

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** The nth weekday (0 Sunday … 6 Saturday) of a month; n = -1 is the last one. */
function nth(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return iso(y, m, lastDay - ((last - weekday + 7) % 7));
}

export function usHolidaysOf(year: number): { date: string; name: string }[] {
  return [
    { date: iso(year, 1, 1), name: "New Year's Day" },
    { date: nth(year, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { date: nth(year, 2, 1, 3), name: "Presidents' Day" },
    { date: nth(year, 5, 1, -1), name: "Memorial Day" },
    { date: iso(year, 6, 19), name: "Juneteenth" },
    { date: iso(year, 7, 4), name: "Independence Day" },
    { date: nth(year, 9, 1, 1), name: "Labor Day" },
    { date: iso(year, 11, 11), name: "Veterans Day" },
    { date: nth(year, 11, 4, 4), name: "Thanksgiving" },
    { date: iso(year, 12, 25), name: "Christmas Day" },
  ];
}

/** The holidays from `from` to `to` (both included, "YYYY-MM-DD"), for a US time zone; none elsewhere. */
export function holidaysBetween(tz: string, from: string, to: string): { date: string; name: string }[] {
  if (!usesUsHolidays(tz)) return [];
  const out: { date: string; name: string }[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) for (const h of usHolidaysOf(y)) if (h.date >= from && h.date <= to) out.push(h);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** A named break or a plain closure: "Thanksgiving Break", "Spring break", "No classes", "Campus closed", "Reading day". */
const BREAK_WORDS =
  /\b((spring|fall|autumn|winter|summer|thanksgiving|holiday|mid-?(term|semester)|semester|term|reading|study) break|no (class|classes|school)|classes (do not|don't|will not|won't) meet|(campus|university|college|school|offices?)( is| are)? closed|recess|reading (day|period|week)|day off)\b/i;
/** What may stand beside a holiday's name in a day-off title ("Labor Day (observed) - no classes"), and nothing else. */
const FILLER = /\b(day|eve|observed|holidays?|break|no|class|classes|school|campus|closed|the|university|college|recess|jr|of)\b|[^a-z]+/gi;

const HOLIDAY_NAMES: [RegExp, string][] = [
  [/new year'?s?/i, "New Year's Day"],
  [/martin luther king|\bmlk\b/i, "Martin Luther King Jr. Day"],
  [/presidents'? day|washington'?s birthday/i, "Presidents' Day"],
  [/memorial day/i, "Memorial Day"],
  [/juneteenth/i, "Juneteenth"],
  [/independence day|fourth of july|4th of july/i, "Independence Day"],
  [/labor day/i, "Labor Day"],
  [/veterans'? day/i, "Veterans Day"],
  [/thanksgiving/i, "Thanksgiving"],
  [/christmas/i, "Christmas Day"],
];

/**
 * A day off by its title, from any calendar the person connected (a Canvas "Thanksgiving Break - No Classes", a school
 * calendar's "Spring Break", "Campus closed", "Labor Day"): it shows as a day off, never as a class (owner, 2026-11-18:
 * "if a holiday or smth like that is given from a different calendar like the canvas one it has to be added too").
 * Strict on purpose (QA, 2026-11-18): a class whose title only mentions a holiday or a break ("Lecture: Holiday
 * Marketing", "Christmas Carol seminar", "Break-even analysis workshop", "Lunch break") is not a day off. Only all-day
 * events are ever asked.
 */
export function isDayOff(title: string): boolean {
  if (BREAK_WORDS.test(title)) return true;
  // a plain "Holiday" / "University holiday"
  if (/^\s*((school|university|college|campus|public|bank) )?holidays?\s*$/i.test(title)) return true;
  // a public holiday by name, with nothing but filler beside it
  const hit = HOLIDAY_NAMES.find(([re]) => re.test(title));
  return !!hit && title.replace(hit[0], " ").replace(FILLER, "").trim() === "";
}

/** The public holiday a title names ("Thanksgiving Day", "MLK Day"), or null. */
export function usHolidayNamed(title: string): string | null {
  return HOLIDAY_NAMES.find(([re]) => re.test(title))?.[1] ?? null;
}
