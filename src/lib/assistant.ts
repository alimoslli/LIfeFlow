import type { UserPreferences } from "@/server/db/schema";

/** The user's personal assistant: they choose its name, personality and voice. */
export const DEFAULT_ASSISTANT_NAME = "Jarvis";

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

export type AssistantProfile = { name: string; style: AssistantStyle; notes: string | null; voice: AssistantVoice };

export function assistantProfile(p: UserPreferences | undefined | null): AssistantProfile {
  return {
    name: p?.assistantName?.trim() || DEFAULT_ASSISTANT_NAME,
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
