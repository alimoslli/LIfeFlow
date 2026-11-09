import type { UserPreferences } from "@/server/db/schema";

/**
 * The user's skyling (owner, 2026-11-09: never "assistant", "AI assistant" or "AI companion" anywhere in the product): they choose
 * its name, personality and voice. Until they pick a name, sentences say "your skyling".
 */
export const UNNAMED_ASSISTANT = "your skyling";

/** The name at the start of a sentence or as a heading: "Your skyling" until they choose one. */
export const nameAtStart = (name: string) => (name === UNNAMED_ASSISTANT ? "Your skyling" : name);

/** The empty chat's line under "What can I take off your plate?": only what this account has (services/integrations `whatAssistantKnows`). */
export function knowsLine(areas: string[] | undefined) {
  if (!areas?.length) return "Tell me about your week and I'll help you plan it.";
  const list = areas.length < 2 ? areas[0] : `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`;
  return `I know your ${list}.`;
}

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

/** `name` is what to call it in a sentence; `named` is false until the user has chosen a name. */
export type AssistantProfile = { name: string; named: boolean; style: AssistantStyle; notes: string | null; voice: AssistantVoice };

export function assistantProfile(p: UserPreferences | undefined | null): AssistantProfile {
  const chosen = p?.assistantName?.trim();
  return {
    name: chosen || UNNAMED_ASSISTANT,
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
