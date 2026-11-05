/**
 * What the person's routine says about when a suggestion may go: class times typed as free text
 * (`courses.meetingInfo`) and the bedtime they told the assistant. Pure, so it's easy to test;
 * anything it can't read reliably comes back null and the caller offers nothing.
 */

export type Meeting = { days: number[]; start: string; end: string };

const DAY: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
/** Compact codes like MWF, TTh, TR (T alone is Tuesday; Th or R is Thursday). */
const COMPACT: [string, number][] = [
  ["th", 4],
  ["tu", 2],
  ["su", 0],
  ["sa", 6],
  ["m", 1],
  ["t", 2],
  ["w", 3],
  ["r", 4],
  ["f", 5],
];

function daysOf(token: string): number[] | null {
  const t = token.toLowerCase().replace(/\.$/, "");
  const word = t.endsWith("s") && t.slice(0, -1) in DAY ? t.slice(0, -1) : t;
  if (word in DAY) return [DAY[word]];
  if (!/^[a-z]{1,7}$/.test(t)) return null;
  const out: number[] = [];
  for (let i = 0; i < t.length;) {
    const hit = COMPACT.find(([c]) => t.startsWith(c, i));
    if (!hit) return null;
    out.push(hit[1]);
    i += hit[0].length;
  }
  return out;
}

function daysPart(text: string): number[] | null {
  const tokens = text
    .trim()
    .replace(/^[,;:|]+|[,;:|@]+$/g, "")
    .split(/\s*(?:\/|,|&|\+|\band\b|\s)\s*/i)
    .filter(Boolean);
  if (!tokens.length) return null;
  const days = new Set<number>();
  for (const tok of tokens) {
    const d = daysOf(tok);
    if (!d) return null;
    d.forEach((x) => days.add(x));
  }
  return [...days].sort((a, b) => a - b);
}

const RANGE = /(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d:])/gi;
const TIME_LIKE = /\d{1,2}:\d{2}|\d\s*[ap]\.?m\b/i;
const NO_FIXED_TIME = /\b(online|asynchronous|async|any ?time|self[- ]paced)\b/i;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function minutesOf(h: number, m: number, mer: "a" | "p" | null) {
  if (m > 59) return null;
  if (mer) return h < 1 || h > 12 ? null : ((h % 12) + (mer === "p" ? 12 : 0)) * 60 + m;
  return h > 23 ? null : h * 60 + m;
}

/**
 * Class meetings from free text such as "Tue/Thu 13:00–14:15", "MWF 9:00-9:50 AM" or "Tuesdays and Thursdays 2:30 pm - 3:45 pm".
 * [] only when the text says the class has no fixed time (online, asynchronous). Null when it can't be read reliably,
 * including no text at all (the times are unknown, not free) and 1 to 11 o'clock with no AM or PM ("W 7:00-9:45" is
 * often an evening class), unless the range uses 24-hour time (13:00 and up).
 */
export function parseMeetingInfo(text: string | null | undefined): Meeting[] | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const out: Meeting[] = [];
  let from = 0;
  for (const m of s.matchAll(RANGE)) {
    const days = daysPart(s.slice(from, m.index));
    if (!days) return null;
    const mer = (x?: string) => (x ? (x[0].toLowerCase() as "a" | "p") : null);
    const [sm, em] = [mer(m[3]), mer(m[6])];
    // Every time needs minutes or AM/PM ("10-11" could be anything).
    if ((!m[2] && !sm && !em) || (!m[5] && !em && !sm)) return null;
    const hours = [Number(m[1]), Number(m[4])];
    // "7:00-9:45" with no AM/PM: morning or evening? Clear only in 24-hour time or at noon.
    if (!sm && !em && !hours.some((h) => h >= 13) && hours.some((h) => h >= 1 && h <= 11)) return null;
    let start = minutesOf(Number(m[1]), Number(m[2] ?? 0), sm ?? em);
    let end = minutesOf(Number(m[4]), Number(m[5] ?? 0), em ?? sm);
    if (start == null || end == null) return null;
    // "11:00-12:15 PM": the start is in the morning. "9:00 AM-1:00": the end is after noon.
    if (!sm && em === "p" && start > end) start = minutesOf(Number(m[1]), Number(m[2] ?? 0), "a");
    if (start != null && !em && sm === "a" && end <= start) end = minutesOf(Number(m[4]), Number(m[5] ?? 0), "p");
    if (start == null || end == null || end <= start || end - start > 360) return null;
    out.push({ days, start: hhmm(start), end: hhmm(end) });
    from = m.index + m[0].length;
  }
  if (!out.length) return NO_FIXED_TIME.test(s) && !/\d/.test(s) ? [] : null;
  if (TIME_LIKE.test(s.slice(from))) return null; // a time we couldn't place
  return out;
}

/** Never earlier than this, whatever the calendar says: suggestions don't take sleep. */
export const EARLIEST_SLOT = "09:00";
const BEDTIME = "when i usually go to bed on a weeknight";

/**
 * The earliest a suggested slot may start, from the bedtime answer (questions.ts "bedtime") when one is saved:
 * about 8 hours after a bedtime past midnight (an hour more for "after"), never before EARLIEST_SLOT.
 * Null when bedtime is in the daytime (night work): no morning slot is safe to suggest.
 */
export function earliestSlotStart(memories: { content: string }[]): string | null {
  const floor = Number(EARLIEST_SLOT.slice(0, 2)) * 60;
  const saved = memories.find((m) => m.content.toLowerCase().startsWith(BEDTIME));
  if (!saved) return EARLIEST_SLOT;
  const answer = saved.content.slice(BEDTIME.length).toLowerCase();
  const times = [...answer.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a|p)\.?m\b/g)];
  const last = times[times.length - 1];
  if (!last) return EARLIEST_SLOT;
  const bed = minutesOf(Number(last[1]), Number(last[2] ?? 0), last[3] as "a" | "p");
  if (bed == null) return EARLIEST_SLOT;
  if (bed >= 18 * 60) return EARLIEST_SLOT;
  if (bed >= 6 * 60) return null;
  return hhmm(Math.max(floor, bed + 8 * 60 + (/\bafter\b/.test(answer) ? 60 : 0)));
}
