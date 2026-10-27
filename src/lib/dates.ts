import { TZDate } from "@date-fns/tz";
import { addDays, format, parseISO } from "date-fns";

/** Local calendar date strings are always YYYY-MM-DD. */
export type DateStr = string;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Today's date in a time zone. */
export function todayIn(tz: string, now: Date = new Date()): DateStr {
  return format(new TZDate(now, tz), "yyyy-MM-dd");
}

/** The local date (in tz) of an instant. */
export function localDateOf(instant: Date, tz: string): DateStr {
  return format(new TZDate(instant, tz), "yyyy-MM-dd");
}

/** Converts a local date + optional HH:mm time in tz to a UTC instant. No time => 23:59 (end of day). */
export function localToInstant(date: DateStr, time: string | null | undefined, tz: string): Date {
  if (!isValidDateStr(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time && TIME_RE.test(time) ? time.split(":").map(Number) : [23, 59];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, tz).getTime());
}

/** Start of a local day (00:00 in tz) as an instant. */
export function startOfLocalDay(date: DateStr, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime());
}

export function addDaysStr(date: DateStr, days: number): DateStr {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

/** Monday-based (default) or Sunday-based week start containing `date`. */
export function weekStart(date: DateStr, weekStartsOn: 0 | 1 = 1): DateStr {
  const dow = parseISO(date).getDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDaysStr(date, -diff);
}

export function monthStart(date: DateStr): DateStr {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: DateStr): DateStr {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function dayOfWeek(date: DateStr): number {
  return parseISO(date).getDay();
}

/** Formats an instant in tz using a date-fns pattern. */
export function formatIn(instant: Date | string, tz: string, pattern: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return format(new TZDate(d, tz), pattern);
}

/** HH:mm local time of an instant. */
export function localTimeOf(instant: Date, tz: string): string {
  return formatIn(instant, tz, "HH:mm");
}

export function formatDateStr(date: DateStr, pattern = "EEE, MMM d"): string {
  return format(parseISO(date), pattern);
}

export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** Human relative label for a local date compared to today. */
export function relativeDayLabel(date: DateStr, today: DateStr): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days ago`;
  if (diff < 7) return formatDateStr(date, "EEEE");
  return formatDateStr(date, "MMM d");
}

/** "Today 5:00 PM", "Tomorrow", "Fri 9:00 AM", "Nov 3" — for due dates. */
export function dueLabel(dueAt: Date | null, allDay: boolean, tz: string, now: Date = new Date()): { text: string; overdue: boolean; soon: boolean } {
  if (!dueAt) return { text: "", overdue: false, soon: false };
  const today = todayIn(tz, now);
  const d = localDateOf(dueAt, tz);
  const diff = daysBetween(today, d);
  const time = allDay ? "" : ` ${formatIn(dueAt, tz, "h:mm a")}`;
  const overdue = dueAt.getTime() < now.getTime();
  let day: string;
  if (diff === 0) day = "Today";
  else if (diff === 1) day = "Tomorrow";
  else if (diff === -1) day = "Yesterday";
  else if (diff > 1 && diff < 7) day = formatIn(dueAt, tz, "EEE");
  else day = formatIn(dueAt, tz, diff > 300 || diff < -300 ? "MMM d, yyyy" : "MMM d");
  return { text: `${day}${time}`, overdue, soon: !overdue && diff <= 2 };
}
