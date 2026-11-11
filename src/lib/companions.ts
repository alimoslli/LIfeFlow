import type { AssistantStyle } from "@/lib/assistant";

/**
 * The cast (owner, 2026-11-09, made five on 2026-11-11; docs/design/companions/cast.md): five companions named for moments of the sky. The one the
 * person picks is their assistant: it takes the skyling's name unless they type their own, and its tone sets how the
 * assistant talks. Pure data, shared by the server (onboarding, the prompt) and the drawing engine
 * (components/day-clock/companion.ts). Words here are user-facing: plain, short, no em dashes.
 */
export const COMPANION_KEYS = ["dawn", "ray", "goldie", "star", "moon"] as const;
export type CompanionKey = (typeof COMPANION_KEYS)[number];

export type CompanionShape = "round" | "tall" | "pear" | "hood";
export type CompanionCrown = "wisp" | "rays" | "lowsun" | "antenna" | "sparkles";

export type CompanionInfo = {
  key: CompanionKey;
  name: string;
  /** The moment of the sky the name comes from. */
  moment: string;
  /** Who it is, in one line. */
  line: string;
  traits: [string, string, string];
  /** What it's best at. */
  skill: string;
  tone: AssistantStyle;
  /** How it talks, for the prompt (per user, so in buildContext, never INSTRUCTIONS). */
  voiceNote: string;
  /** A morning nudge, the sample line in onboarding and Settings. */
  sample: string;
  look: {
    shape: CompanionShape;
    crown: CompanionCrown;
    eyes: "round" | "focused" | "lidded" | "glow";
    mouth: "smile" | "grin" | "line" | "soft" | "smirk";
    body: string;
    dark: string;
    light: string;
    trim: string;
    trim2: string;
    band?: string;
    cheek: string;
    eye: string;
    /** Star: itself at night, pale and squinting by day. */
    shy?: boolean;
  };
};

const INK = "#262320";

export const COMPANIONS: CompanionInfo[] = [
  {
    key: "dawn",
    name: "Dawn",
    moment: "First light",
    line: "Up before you, quietly glad you're here.",
    traits: ["gentle", "patient", "hopeful"],
    skill: "Getting the morning started: the first small thing, before the day piles up.",
    tone: "friend",
    voiceNote: "Soft and encouraging, starts small, never rushes.",
    sample: "Morning. Water first, then one small thing: the BIO reading. That's the whole plan for now.",
    look: {
      shape: "round",
      crown: "wisp",
      eyes: "round",
      mouth: "smile",
      body: "#f4b59c",
      dark: "#d4866c",
      light: "#ffe6da",
      trim: "#fff1e6",
      trim2: "#ffd27a",
      cheek: "#ee8e8e",
      eye: INK,
    },
  },
  {
    key: "ray",
    name: "Ray",
    moment: "Daytime sun",
    line: "All go, and it rubs off on you.",
    traits: ["energetic", "honest", "cheerful"],
    skill: "Planning the week and keeping it moving: the big thing first, momentum after.",
    tone: "coach",
    voiceNote: "Upbeat and honest, names the big thing first, ends with the next step.",
    sample: "Up and at it. Two things today, the quiz prep is the big one. Let's open with that.",
    look: {
      shape: "tall",
      crown: "rays",
      eyes: "round",
      mouth: "grin",
      body: "#f6b357",
      dark: "#d4842c",
      light: "#ffe3ad",
      trim: "#f9a63a",
      trim2: "#ffe08a",
      cheek: "#f0937a",
      eye: INK,
    },
  },
  {
    key: "goldie",
    name: "Goldie",
    moment: "Golden hour",
    line: "Warm, steady, and never in a hurry about money.",
    traits: ["warm", "steady", "practical"],
    skill: "Keeping money calm: what's available now, what's due this week, and no drama.",
    tone: "friend",
    voiceNote: "Warm and steady, says the number once, then what it means for the week.",
    sample: "Rent is set for Friday and there's $212 left after it. A slow morning is fine.",
    look: {
      shape: "pear",
      crown: "lowsun",
      eyes: "round",
      mouth: "smile",
      body: "#f3a65a",
      dark: "#c97a33",
      light: "#ffd9ad",
      trim: "#ffcb63",
      trim2: "#fff0b8",
      band: "#c4542a",
      cheek: "#ea8d78",
      eye: INK,
    },
  },
  {
    key: "star",
    name: "Star",
    moment: "Evening",
    line: "Out with the first stars. Sees far and says little.",
    traits: ["far-sighted", "quiet", "dependable"],
    skill: "Deadlines far ahead: counts back from the due date, so the last night is never the whole project.",
    tone: "coach",
    voiceNote: "Calm and precise, counts back from the deadline, keeps watch on the clock.",
    sample: "Morning. Three days to the project. Today's piece is the data table.",
    look: {
      shape: "hood",
      crown: "antenna",
      eyes: "glow",
      mouth: "smirk",
      body: "#34528a",
      dark: "#243c68",
      light: "#5d7fbd",
      trim: "#ffd77a",
      trim2: "#fff3c4",
      cheek: "#7b95c9",
      eye: "#ffd77a",
      shy: true,
    },
  },
  {
    key: "moon",
    name: "Moon",
    moment: "Late night",
    line: "Up late with you, calm and in no hurry.",
    traits: ["calm", "kind", "unhurried"],
    skill: "Late nights: what's left for tonight, a kind look at tomorrow, and when to call it a night.",
    tone: "friend",
    voiceNote: "Quiet and kind, short sentences, one thing at a time. Never scolds anyone for being up late.",
    sample: "Easy start. One thing before noon, the rest later.",
    look: {
      shape: "round",
      crown: "sparkles",
      eyes: "lidded",
      mouth: "smirk",
      body: "#f4eed8",
      dark: "#dcd3b6",
      light: "#fffef6",
      trim: "#d8cda8",
      trim2: "#fff3c4",
      cheek: "#f0bfa6",
      eye: INK,
      shy: true,
    },
  },
];

/** Until someone picks, the wheel shows Ray, the morning sun Today has always had (owner may swap: cast.md decision 3). */
export const DEFAULT_COMPANION: CompanionKey = "ray";

/** Choices saved before the cast became five (owner, 2026-11-11): Noon became Ray, Dusk became Moon. */
const RETIRED: Record<string, CompanionKey> = { noon: "ray", dusk: "moon" };

export const isCompanionKey = (k: unknown): k is CompanionKey => typeof k === "string" && (COMPANION_KEYS as readonly string[]).includes(k);
/** A saved choice as one of today's five (a retired one maps to who took its place). */
export const currentKey = (k: string | null | undefined): CompanionKey | null => (k ? RETIRED[k] : undefined) ?? (isCompanionKey(k) ? k : null);

/**
 * "Changes with the sky" (owner, 2026-11-10): a seventh choice where only the look follows the time, whoever's moment
 * it is. One name and one talking style all day (their own, or "your skyling" and friend). Stored as companion "sky".
 */
export const SKY_CHOICE = "sky" as const;
export type CompanionChoice = CompanionKey | typeof SKY_CHOICE;
export const isCompanionChoice = (k: unknown): k is CompanionChoice => k === SKY_CHOICE || isCompanionKey(k);
export const SKY_CHOICE_LABEL = {
  name: "Changes with the sky",
  moment: "All five, by the time",
  line: "Whoever's up: Dawn at first light, Ray through the day, Moon late at night.",
};

/**
 * Whose moment it is at a minute of the day (0 to 1440), from that day's sunrise and sunset in minutes (owner,
 * 2026-11-11: five, following the real sky): Dawn from 70 minutes before sunrise, Ray through the day, Goldie from 90
 * minutes before sunset, Star from just after sunset into the evening, and Moon from 9 PM (or two hours after sunset,
 * when that's later) until first light, so Moon turns back into Dawn.
 */
export function skylingAt(minute: number, rise: number, set: number): CompanionKey {
  const m = ((minute % 1440) + 1440) % 1440;
  const moon = Math.min(Math.max(21 * 60, set + 120), 1439);
  if (m >= rise - 70 && m < rise + 45) return "dawn";
  if (m >= rise + 45 && m < set - 90) return "ray";
  if (m >= set - 90 && m < set + 5) return "goldie";
  if (m >= set + 5 && m < moon) return "star";
  return "moon";
}

/** Star wears the last of the sunset low on its body for its first hour after sunset (Dusk turning into Star). */
export const starGlowAt = (minute: number, set: number) => minute >= set + 5 && minute < set + 65;

/** Star and Moon are the night's own: drawn in their own colours at night and pale by day. */
export const ownsNight = (key: string | null | undefined) => key === "star" || key === "moon";

/** The skyling for a saved choice (or the default when none was made). */
export function companionOf(key: string | null | undefined): CompanionInfo {
  const k = (key ? RETIRED[key] : undefined) ?? key;
  return COMPANIONS.find((c) => c.key === k) ?? COMPANIONS.find((c) => c.key === DEFAULT_COMPANION)!;
}
