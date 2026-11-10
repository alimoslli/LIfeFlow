import { addDaysStr, dayOfWeek, type DateStr } from "@/lib/dates";

type Series = { day: string; value: number }[];
type Metric = { metric: string; series: Series };

export type HealthView = {
  sleep: { hours: number; text: string; day: string; isToday: boolean } | null;
  stepsYesterday: number | null;
  stepsBefore: { label: string; value: number } | null;
  activeDays: number;
  hasExercise: boolean;
  resting: number | null;
  week: { day: string; letter: string; hours: number | null; isToday: boolean }[];
};

/** "7h 10m" from decimal hours. */
export function hoursText(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Turns the health summary into what the Health page shows. Only values that exist; everything else stays null. */
export function healthView(metrics: Metric[], today: DateStr): HealthView {
  const get = (m: string) => metrics.find((x) => x.metric === m)?.series ?? [];
  const on = (s: Series, d: string) => s.find((x) => x.day === d)?.value ?? null;
  const sleepS = get("sleep_hours");
  const last = sleepS.filter((x) => x.value > 0).at(-1);
  const steps = get("steps");
  const before = addDaysStr(today, -2);
  const sb = on(steps, before);
  const ex = get("exercise_minutes");
  const hr = get("resting_heart_rate").at(-1);
  return {
    sleep: last ? { hours: last.value, text: hoursText(last.value), day: last.day, isToday: last.day === today } : null,
    stepsYesterday: on(steps, addDaysStr(today, -1)),
    stepsBefore: sb == null ? null : { label: SHORT[dayOfWeek(before)], value: sb },
    activeDays: ex.filter((x) => x.value > 0).length,
    hasExercise: ex.length > 0,
    resting: hr ? Math.round(hr.value) : null,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDaysStr(today, i - 6);
      return { day, letter: LETTERS[dayOfWeek(day)], hours: on(sleepS, day), isToday: day === today };
    }),
  };
}
