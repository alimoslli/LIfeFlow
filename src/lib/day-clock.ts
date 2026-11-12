/**
 * The day clock (v3 home, docs/design/clock/spec.md): the shape of what the clock and its timeline draw,
 * and the pure rules that turn agenda items into clock items. Shared by the server read and the client.
 *
 * Times are wall-clock minutes from the start of today in the user's time zone (today 9:30 AM = 570,
 * tomorrow 8:00 AM = 1440 + 480), so the 12-hour face and the line stay right across daylight-saving changes.
 */

/** What a thing on the clock is, for the tiles: the shift, the class, the deadline, or anything else. */
export type ClockCategory = "work" | "class" | "due" | "other";

export type ClockItem = {
  /** Stable per occurrence (the agenda key). */
  id: string;
  /** "block" has a start and an end; "due" is a moment (a deadline, an exam due time, a to-do with a time). */
  kind: "block" | "due";
  cat: ClockCategory;
  icon: string;
  title: string;
  /** Minutes from the start of today (local); negative for earlier days. */
  start: number;
  end: number | null;
  /** All-day things sit at the start of their day on the line and never on the rim. */
  allDay: boolean;
  /** Where tapping "Open" goes: the page or editor that already owns this item. */
  href: string;
  /** Where it came from, in plain words ("From Google Calendar"). */
  source: string;
  subtitle: string | null;
  /** A money amount, positive (only when money is shown): a bill or a trial's first charge, a money goal, expected pay. */
  amountCents?: number;
  /** Where it lives, and its id there: a to-do (or its reminder) or an assignment can be marked done right on its card. */
  origin?:
    | "event"
    | "shift"
    | "assignment"
    | "task"
    | "reminder"
    | "goal"
    | "milestone"
    | "bill"
    | "trial"
    | "money_goal"
    | "pay"
    | "promise"
    | "day"
    | "spend"
    | "spent";
  /** Already done (a to-do or assignment ticked off, a promise kept): it sits where it was done, a star, never late. */
  done?: boolean;
  ref?: string;
  /** No date yet: it waits at the far end of the line, under "Someday". */
  someday?: boolean;
  /** The date in words when only the month or the year is known ("Mar 2019", "2019"); the day is then a place only. */
  when?: string;
  /** An exam (from its class or Canvas): it happens on its day, it's never "due". */
  exam?: boolean;
};

export type ClockDay = { offset: number; date: string; short: string; long: string };

export type ClockData = {
  tz: string;
  today: string;
  /** Today's local midnight as an epoch ms, so the client can work out "now" in the same minutes. */
  base: number;
  days: ClockDay[];
  items: ClockItem[];
  /** Today's steps from Apple Health, when it sends them. Null means nothing to show (never a made-up number). */
  steps: number | null;
  /** Last night's sleep in hours, from Apple Health or what the person logged. */
  sleepHours: number | null;
  /** What was spent today, from the bank (null while the Money lock is on, with no bank, or nothing spent yet). */
  spentTodayCents: number | null;
  /** True when nothing is connected or added yet: the clock shows its hands and one way to start. */
  empty: boolean;
};

/** Agenda kinds as they arrive from services/calendar.ts getAgenda. */
type AgendaKind = "personal" | "class" | "exam" | "work" | "study" | "appointment" | "reminder" | "other" | "deadline" | "task";
type AgendaOrigin = "event" | "shift" | "assignment" | "task";

// Words in a title that say what it is better than its calendar kind does. First match wins; kept short and common.
const WORD_ICONS: [RegExp, string][] = [
  [/\b(study|review|homework|revision)\b/i, "📚"],
  [/\b(exam|midterm|final|quiz|test)\b/i, "📝"],
  [/\boffice hours?\b/i, "🙋"],
  [/\blab\b/i, "🧪"],
  [/\b(gym|workout|lift|weights|yoga|pilates)\b/i, "🏋️"],
  [/\b(run|jog|running)\b/i, "🏃"],
  [/\b(brunch|lunch|dinner|breakfast)\b/i, "🍽️"],
  [/\bcoffee\b/i, "☕"],
  [/\bdentist\b/i, "🦷"],
  [/\b(doctor|clinic|therapy|physio)\b/i, "🩺"],
  [/\b(meeting|standup|stand-up|sync|huddle|1:1)\b/i, "👥"],
  [/\b(call|facetime|zoom)\b/i, "📞"],
  [/\b(flight|airport)\b/i, "✈️"],
  [/\bbirthday\b/i, "🎂"],
  [/\b(class|lecture|seminar|tutorial)\b/i, "🎓"],
  [/\b(practice|game|match|training)\b/i, "🏅"],
  [/\b(haircut|barber)\b/i, "💈"],
  [/\b(movie|cinema)\b/i, "🎬"],
  [/\b(party|concert)\b/i, "🎉"],
  [/\b(rent|bill|payment)\b/i, "💳"],
];

const KIND_ICONS: Record<AgendaKind, string> = {
  class: "🎓",
  exam: "📝",
  work: "💼",
  study: "📚",
  appointment: "📍",
  personal: "🗓️",
  reminder: "🔔",
  other: "🗓️",
  deadline: "📄",
  task: "☑️",
};

/** A title that starts with an emoji ("✈️ Flight to NYC") picked it as its icon: the emoji and the rest. */
export function splitEmoji(title: string): { emoji: string | null; rest: string } {
  const m = title.match(/^\s*(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u);
  if (!m || m[0].length >= title.length) return { emoji: null, rest: title };
  return { emoji: m[1], rest: title.slice(m[0].length) };
}

/** The emoji for a thing: its title's words first (a "Gym" event is 🏋️), then its kind. A shift is always 💼. */
export function iconFor(title: string, kind: AgendaKind, origin: AgendaOrigin): string {
  if (origin === "shift") return "💼";
  for (const [re, icon] of WORD_ICONS) if (re.test(title)) return icon;
  return KIND_ICONS[kind] ?? "🗓️";
}

/** Which tile a thing feeds: work shifts, classes, deadlines (exams, assignments, to-dos with a time), or none. */
export function categoryFor(kind: AgendaKind, origin: AgendaOrigin): ClockCategory {
  if (origin === "shift" || kind === "work") return "work";
  if (kind === "exam" || kind === "deadline" || origin === "task" || origin === "assignment") return "due";
  if (kind === "class") return "class";
  return "other";
}

const SOURCE_WORDS: Record<string, string> = {
  google: "Google Calendar",
  outlook: "Outlook",
  canvas: "Canvas",
  ukg: "your work schedule",
  schedule: "your schedule",
};

/** "From Google Calendar", "From your work schedule", "Added in LifeFlow". */
export function sourceFor(origin: AgendaOrigin, sources: string[] | undefined): string {
  if (origin === "shift") return "From your work schedule";
  if (origin === "assignment") return "From your classes";
  if (origin === "task") return "From your to-dos";
  const named = [...new Set((sources ?? []).map((s) => SOURCE_WORDS[s]).filter((x): x is string => !!x))];
  return named.length ? `From ${named.join(" and ")}` : "Added in LifeFlow";
}

/** A shift's title arrives as "Work · Employer"; on the clock it's just "Work" (the employer stays in the card). */
export function titleFor(title: string, origin: AgendaOrigin): { title: string; subtitle: string | null } {
  if (origin === "shift") {
    const employer = title.replace(/^Work\s*·\s*/, "").trim();
    return { title: "Work", subtitle: employer && employer !== title ? employer : null };
  }
  return { title, subtitle: null };
}

/** Words that already say it's an exam. */
export const EXAM_WORDS = /\b(exam|midterm|final|quiz|test)\b/i;
/** An exam (or quiz, midterm, final, test): marked so by its class or Canvas, or by its title. */
export const isExam = (it: Pick<ClockItem, "title"> & { exam?: boolean }) => !!it.exam || EXAM_WORDS.test(it.title);

/**
 * A pile of one kind says what it is ("9 assignments", "3 to-dos", "2 bills"); a mixed pile is null and shows "+N"
 * (owner, 2026-11-08: "just put one emoji and say 9 assignments due tonight at 11:59").
 */
export function pileOf(g: ClockItem[]): string | null {
  if (g.length < 2) return null;
  const all = (f: (x: ClockItem) => boolean) => g.every(f);
  const noun = all(isExam)
    ? "exams"
    : all((x) => x.origin === "assignment")
      ? "assignments"
      : all((x) => x.origin === "task" || x.origin === "reminder")
        ? "to-dos"
        : all((x) => x.origin === "assignment" || x.origin === "task")
          ? "deadlines"
          : all((x) => x.origin === "bill")
            ? "bills"
            : all((x) => !!x.done)
              ? "done"
              : null;
  return noun ? `${g.length} ${noun}` : null;
}

/** A pile's words on the sky: "9 assignments due", "2 bills due"; exams happen and done is done, so never "due". */
export const pileDue = (pile: string) => (/ (exams|done)$/.test(pile) ? pile : `${pile} due`);

/**
 * About when the sun rises and sets on a day, in minutes from that day's local midnight (Morrow: the day is the sky).
 * There's no location, so it uses the time zone: its standard meridian for longitude and 38°N for latitude, with the
 * equation of time and daylight saving. Close enough to draw the sky (within about half an hour in most of a zone);
 * never shown as an exact time.
 */
export function sunTimes(date: string, tz: string): { rise: number; set: number } {
  const [y, m, d] = date.split("-").map(Number);
  const offsetAt = (when: number) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(new Date(when));
    const v = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
    return (Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - when) / 60000;
  };
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const off = offsetAt(noonUtc);
  const std = Math.min(offsetAt(Date.UTC(y, 0, 15, 12)), offsetAt(Date.UTC(y, 6, 15, 12)));
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const b = (2 * Math.PI * (n - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noon = 720 - eot + (off - std);
  const rad = Math.PI / 180;
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365) * rad;
  const lat = 38 * rad;
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  const half = (Math.acos(Math.max(-1, Math.min(1, cosH))) / rad) * 4;
  return { rise: Math.round(noon - half), set: Math.round(noon + half) };
}
