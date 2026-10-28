import type { UserPreferences } from "@/server/db/schema";

/** The user's personal assistant: they choose its name, personality and voice. */
export const DEFAULT_ASSISTANT_NAME = "Jarvis";

export const ASSISTANT_STYLES = {
  balanced: { label: "Balanced", hint: "Clear and friendly", prompt: "Warm, direct and concise." },
  warm: {
    label: "Warm & encouraging",
    hint: "Supportive, celebrates progress",
    prompt: "Warm and encouraging. Acknowledge effort and progress, and keep a positive, supportive tone without sugarcoating facts.",
  },
  direct: {
    label: "Straight to the point",
    hint: "Short answers, no fluff",
    prompt: "Very brief and direct. Lead with the answer in one or two sentences; skip pleasantries.",
  },
  coach: {
    label: "Coach",
    hint: "Pushes you, holds you accountable",
    prompt: "Like a motivating coach: honest, energetic, holds the user accountable to their goals and suggests the next concrete step.",
  },
  playful: { label: "Playful", hint: "Light humor, still useful", prompt: "Friendly with light, good-natured humor, while staying accurate and useful." },
  professional: { label: "Professional", hint: "Polished, formal", prompt: "Polished and professional, like an executive assistant." },
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
    style: p?.assistantStyle && p.assistantStyle in ASSISTANT_STYLES ? p.assistantStyle : "balanced",
    notes: p?.assistantNotes?.trim() || null,
    voice: p?.assistantVoice && p.assistantVoice in ASSISTANT_VOICES ? p.assistantVoice : "marin",
  };
}
