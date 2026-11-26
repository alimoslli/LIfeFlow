import { addDaysStr, dayOfWeek, formatDateStr, localDateOf, localTimeOf } from "@/lib/dates";
import { listShifts } from "../work";
import type { Detector } from "./detectors";

/**
 * Sunday reset's learned suggestion (owner, 2026-11-26, gamechanger 7): from their own recorded punches, a weekday whose
 * shifts keep running long, and next week has one that day; the suggestion is to keep the hour after it free. Only real
 * clock-outs count (never a guess); at least 2 long ones out of 3 or more that day in the last 6 weeks. Pure rule below.
 */
export function longDays(shifts: { startsAt: Date; endsAt: Date; recordedEnd: Date | null }[], tz: string, minLateMin = 20) {
  const by = new Map<number, { worked: number; long: number; lateMin: number[] }>();
  for (const s of shifts) {
    if (!s.recordedEnd) continue;
    const dow = dayOfWeek(localDateOf(s.startsAt, tz));
    const d = by.get(dow) ?? { worked: 0, long: 0, lateMin: [] };
    d.worked++;
    const late = (s.recordedEnd.getTime() - s.endsAt.getTime()) / 60_000;
    if (late >= minLateMin) {
      d.long++;
      d.lateMin.push(late);
    }
    by.set(dow, d);
  }
  const out = new Map<number, { long: number; worked: number; typicalMin: number }>();
  for (const [dow, d] of by) {
    if (d.worked < 3 || d.long < 2 || d.long * 2 < d.worked) continue;
    const sorted = [...d.lateMin].sort((a, b) => a - b);
    // the typical overrun, rounded down to 5 minutes: never more than it really was
    out.set(dow, { long: d.long, worked: d.worked, typicalMin: Math.floor(sorted[Math.floor((sorted.length - 1) / 2)] / 5) * 5 });
  }
  return out;
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const plusMin = (hhmm: string, mins: number) => {
  const t = Math.min(23 * 60 + 59, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + mins);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export const sundayLearned: Detector = async ({ scope, tz, today }) => {
  if (dayOfWeek(today) !== 0) return [];
  const past = await listShifts(scope, tz, addDaysStr(today, -42), addDaysStr(today, -1));
  const long = longDays(past, tz);
  if (!long.size) return [];
  const next = await listShifts(scope, tz, addDaysStr(today, 1), addDaysStr(today, 7));
  for (const s of next) {
    if (s.status !== "scheduled") continue;
    const date = localDateOf(s.startsAt, tz);
    const l = long.get(dayOfWeek(date));
    if (!l) continue;
    const end = localTimeOf(s.endsAt, tz).slice(0, 5);
    if (end >= "23:00" || localDateOf(s.endsAt, tz) !== date) continue; // nothing after it to keep free that night
    const day = formatDateStr(date, "EEEE");
    return [
      {
        kind: "sunday_learned",
        topic: "general",
        dedupeKey: `sunday_learned:${today}`,
        facts: { day, workplace: s.employer.name, long: l.long, worked: l.worked, typicalMin: l.typicalMin, endsAt: clock(end) },
        action: { type: "block_time", label: "Keep it free", date, start: end, end: plusMin(end, 60), title: `Room after ${s.employer.name}` },
        priority: 58,
      },
    ];
  }
  return [];
};
