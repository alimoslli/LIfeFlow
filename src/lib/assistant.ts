import type { UserPreferences } from "@/server/db/schema";
import { companionOf } from "./companions";
import { resolveSkyling } from "./skyling-now";

/**
 * The user's skyling (owner, 2026-11-09: never "assistant", "AI assistant" or "AI companion" anywhere in the product): they choose
 * its name, personality and voice. Without a name of their own it goes by its own (Ray, Star, ...; for "Changes with the sky",
 * whoever is up), owner 2026-11-10. "your skyling" is only for places with no account (the landing page).
 */
export const UNNAMED_ASSISTANT = "your skyling";

/**
 * Old names that were saved as a name and are never shown as the skyling's: the old product name (owner, 2026-11-10:
 * "Dev" is out), and the skylings' own former names, saved when one was picked (2026-11-11: Noon and Dusk retired, Star
 * is now Twinkle and Moon is Dreamy), so they go by today's name.
 */
const OLD_NAMES = new Set(["Dev", "Noon", "Dusk", "Star", "Moon"]);

/** The name at the start of a sentence or as a heading. */
export const nameAtStart = (name: string) => (name === UNNAMED_ASSISTANT ? "Your skyling" : name);

/** A short noun label (the tab, a list row): "Skyling" until they choose a name. */
export const assistantLabel = (name: string) => (name === UNNAMED_ASSISTANT ? "Skyling" : name);

export const ASSISTANT_STYLES = {
  coach: {
    label: "Coach",
    hint: "Motivating, holds you to your goals",
    prompt:
      "Like a motivating coach: honest, energetic, celebrates wins, holds the user accountable to their goals and always ends with the next concrete step. Never shames.",
  },
  friend: {
    label: "Friend",
    hint: "Casual and warm",
    prompt: "Casual and warm, like a smart friend who has their back. Encouraging without sugarcoating facts.",
  },
  direct: {
    label: "Straight to the point",
    hint: "Short, numbers only",
    prompt: "Very brief and direct. Lead with the answer and the numbers in one or two sentences; skip pleasantries.",
  },
} as const;
export type AssistantStyle = keyof typeof ASSISTANT_STYLES;

/** Voices offered by OpenAI's live (Realtime) speech models. */
export const ASSISTANT_VOICES = {
  marin: "Natural, warm",
  cedar: "Natural, calm and deep",
  alloy: "Neutral, balanced",
  ash: "Clear, confident",
  ballad: "Soft, expressive",
  coral: "Bright, friendly",
  echo: "Smooth, low",
  sage: "Gentle, thoughtful",
  shimmer: "Light, upbeat",
  verse: "Lively, dynamic",
} as const;
export type AssistantVoice = keyof typeof ASSISTANT_VOICES;

/** `name` is what to call it in a sentence; `named` is false until the user has chosen a name (it then goes by its own). */
export type AssistantProfile = { name: string; named: boolean; style: AssistantStyle; notes: string | null; voice: AssistantVoice };

/** The skyling's own name for a saved choice: Ray by default, whoever is up for "Changes with the sky". */
export const skylingName = (choice: string | null | undefined, tz = "UTC", now?: Date) => companionOf(resolveSkyling(choice, tz, now)).name;

export function assistantProfile(p: UserPreferences | undefined | null, tz = "UTC"): AssistantProfile {
  const saved = p?.assistantName?.trim();
  const chosen = saved && !OLD_NAMES.has(saved) ? saved : undefined;
  return {
    name: chosen || skylingName(p?.companion, tz),
    named: !!chosen,
    style: styleOf(p?.assistantStyle),
    notes: p?.assistantNotes?.trim() || null,
    voice: p?.assistantVoice && p.assistantVoice in ASSISTANT_VOICES ? p.assistantVoice : "marin",
  };
}

/** Older personalities map onto the three current tones. */
function styleOf(s: string | undefined): AssistantStyle {
  if (s === "coach" || s === "friend" || s === "direct") return s;
  return s === "professional" ? "direct" : "friend";
}
