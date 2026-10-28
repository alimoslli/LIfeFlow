import { addDaysStr, formatDateStr, isValidDateStr, monthEnd, monthStart, type DateStr } from "./dates";

/**
 * Every money total in the app names its time range. These are the ranges
 * pages and Jarvis share, so the same words always mean the same dates.
 */
export const PERIOD_KEYS = ["month", "last_month", "90d", "year", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number] | "custom";
export type Period = { key: PeriodKey; from: DateStr; to: DateStr; label: string };

const ALL_FROM = "2000-01-01";

/** Plain-language range, e.g. "Oct 1 to 28, 2026" or "Jul 31 to Oct 28, 2026". */
export function rangeLabel(from: DateStr, to: DateStr): string {
  if (from === ALL_FROM) return `All time to ${formatDateStr(to, "MMM d, yyyy")}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  if (from === to) return formatDateStr(from, "MMM d, yyyy");
  if (sameMonth) return `${formatDateStr(from, "MMM d")} to ${formatDateStr(to, "d, yyyy")}`;
  if (sameYear) return `${formatDateStr(from, "MMM d")} to ${formatDateStr(to, "MMM d, yyyy")}`;
  return `${formatDateStr(from, "MMM d, yyyy")} to ${formatDateStr(to, "MMM d, yyyy")}`;
}

export function resolvePeriod(key: string | undefined, today: DateStr, custom?: { from?: string; to?: string }): Period {
  if (custom?.from && custom?.to && isValidDateStr(custom.from) && isValidDateStr(custom.to) && custom.from <= custom.to)
    return { key: "custom", from: custom.from, to: custom.to, label: rangeLabel(custom.from, custom.to) };
  const make = (k: PeriodKey, from: DateStr, to: DateStr): Period => ({ key: k, from, to, label: rangeLabel(from, to) });
  switch (key) {
    case "last_month": {
      const s = monthStart(addDaysStr(monthStart(today), -1));
      return make("last_month", s, monthEnd(s));
    }
    case "90d":
      return make("90d", addDaysStr(today, -89), today);
    case "year":
      return make("year", `${today.slice(0, 4)}-01-01`, today);
    case "all":
      return make("all", ALL_FROM, today);
    default:
      return make("month", monthStart(today), today);
  }
}

export const PERIOD_NAMES: Record<(typeof PERIOD_KEYS)[number], string> = {
  month: "This month",
  last_month: "Last month",
  "90d": "Last 90 days",
  year: "This year",
  all: "All time",
};
