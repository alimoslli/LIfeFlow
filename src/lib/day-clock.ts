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
  /** A bill's amount, positive (only when money is shown). */
  amountCents?: number;
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
