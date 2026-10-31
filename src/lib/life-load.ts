import { addDaysStr, daysBetween, formatDateStr } from "./dates";

/**
 * Life load (ADR 0020): how full each of the next 7 days really is, from facts.
 * Committed time (classes, events, shifts) plus the work deadlines need, spread
 * over the days before they're due, plus to-dos. A day with nothing due tonight
 * still carries the prep for what's coming. Money pressure is shown, not scored.
 */

/** Realistic hours of focused time in a day once sleep, meals and travel are out. */
export const DAY_CAPACITY_HOURS = 10;

/** Rough hours of work each kind of deadline needs (a starting point, not a promise). */
const EFFORT_HOURS: Record<string, number> = { exam: 4, project: 3, assignment: 1.5, lab: 1.5, quiz: 1, reading: 1, discussion: 0.5, other: 1 };
/** How the work is spread over the days before the due day (last entry = the day before). */
const SPREAD: Record<string, number[]> = { exam: [0.15, 0.25, 0.25, 0.35], project: [0.2, 0.3, 0.5], default: [0.4, 0.6] };

export type LoadInput = {
  today: string;
  /** Blocking time per day: classes, events, shifts. */
  committed: { date: string; minutes: number; label: string }[];
  /** Graded work due in the next 14 days (and overdue, with date before today). */
  deadlines: { date: string; title: string; kind: string; course?: string | null }[];
  tasks: { date: string; title: string; priority: string }[];
  /** Only when Money isn't locked. */
  bills?: { date: string; name: string; amountCents: number }[];
  liquidCents?: number | null;
};

export type LoadLevel = "light" | "steady" | "heavy" | "overloaded";
export type DayLoad = {
  date: string;
  label: string;
  /** "Today" or a 3-letter weekday, for tight spaces. */
  short: string;
  hours: number;
  /** 0–100 of a full day's capacity (capped). */
  percent: number;
  level: LoadLevel;
  parts: { committed: number; schoolwork: number; todos: number };
  /** The biggest contributors, plain facts, at most 3. */
  reasons: string[];
  /** A bill is due that day; `short` when checking can't cover the week's bills so far. */
  money: { name: string; amountCents: number; short: boolean }[];
};
export type WeekLoad = {
  days: DayLoad[];
  totalHours: number;
  heaviest: DayLoad;
  /** The lightest day before the heaviest one (where work can move), if it's clearly lighter. */
  lighterBefore: DayLoad | null;
  summary: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${round1(h)}h`.replace(".0h", "h"));

export function levelFor(hours: number): LoadLevel {
  if (hours > DAY_CAPACITY_HOURS) return "overloaded";
  if (hours >= 7) return "heavy";
  if (hours >= 4) return "steady";
  return "light";
}

export function computeLifeLoad(i: LoadInput): WeekLoad {
  const dates = Array.from({ length: 7 }, (_, k) => addDaysStr(i.today, k));
  const idx = new Map(dates.map((d, k) => [d, k]));
  const committed = dates.map(() => 0);
  const school = dates.map(() => 0);
  const todos = dates.map(() => 0);
  const why: { text: string; hours: number }[][] = dates.map(() => []);
  const add = (k: number, h: number, text: string, bucket: number[]) => {
    if (k < 0 || k > 6 || h <= 0) return;
    bucket[k] += h;
    const found = why[k].find((w) => w.text === text);
    if (found) found.hours += h;
    else why[k].push({ text, hours: h });
  };

  for (const c of i.committed) {
    const k = idx.get(c.date);
    if (k !== undefined) add(k, c.minutes / 60, c.label, committed);
  }

  for (const d of i.deadlines) {
    const hours = EFFORT_HOURS[d.kind] ?? EFFORT_HOURS.other;
    const name = `${d.course ? `${d.course} ` : ""}${d.title}`;
    const daysUntil = daysBetween(i.today, d.date);
    if (daysUntil < 0) {
      add(0, hours, `Overdue: ${name}`, school); // late work lands on today
      continue;
    }
    const spread = SPREAD[d.kind] ?? SPREAD.default;
    // Work happens on the days before the due date. Days already past roll onto today
    // (something due today is today's job); days past this week are left out.
    const label = d.kind === "exam" ? `${name} prep` : name;
    spread.forEach((share, j) => add(Math.max(0, daysUntil + j - spread.length), hours * share, label, school));
  }

  for (const t of i.tasks) {
    const k = idx.get(t.date) ?? (t.date < i.today ? 0 : undefined);
    if (k !== undefined) add(k, t.priority === "urgent" || t.priority === "high" ? 1 : 0.5, `To-do: ${t.title}`, todos);
  }

  let runningBills = 0;
  const money = dates.map((date) =>
    (i.bills ?? [])
      .filter((b) => b.date === date)
      .map((b) => {
        runningBills += b.amountCents;
        return { name: b.name, amountCents: b.amountCents, short: i.liquidCents != null && runningBills > i.liquidCents };
      }),
  );

  const days: DayLoad[] = dates.map((date, k) => {
    const hours = round1(committed[k] + school[k] + todos[k]);
    return {
      date,
      label: k === 0 ? "Today" : k === 1 ? "Tomorrow" : formatDateStr(date, "EEEE"),
      short: k === 0 ? "Today" : formatDateStr(date, "EEE"),
      hours,
      percent: Math.min(100, Math.round((hours / DAY_CAPACITY_HOURS) * 100)),
      level: levelFor(hours),
      parts: { committed: round1(committed[k]), schoolwork: round1(school[k]), todos: round1(todos[k]) },
      reasons: why[k]
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 3)
        .map((w) => `${w.text} (${fmtH(w.hours)})`),
      money: money[k],
    };
  });

  const heaviest = days.reduce((a, b) => (b.hours > a.hours ? b : a));
  const before = days.filter((d) => d.date < heaviest.date);
  const lightest = before.length ? before.reduce((a, b) => (b.hours < a.hours ? b : a)) : null;
  const lighterBefore = lightest && heaviest.hours - lightest.hours >= 3 ? lightest : null;
  const totalHours = round1(days.reduce((s, d) => s + d.hours, 0));

  const summary =
    heaviest.hours < 4
      ? "A light week. A good time to get ahead on something big."
      : `${heaviest.label} is your heaviest day (${fmtH(heaviest.hours)}${heaviest.level === "overloaded" ? `, ${fmtH(heaviest.hours - DAY_CAPACITY_HOURS)} more than fits` : ""}).` +
        (lighterBefore
          ? ` ${lighterBefore.label} is lighter (${fmtH(lighterBefore.hours)}), so start early then.`
          : heaviest.label === "Today"
            ? " It gets lighter after today."
            : "");

  return { days, totalHours, heaviest, lighterBefore, summary };
}
