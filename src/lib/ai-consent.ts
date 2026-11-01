import type { UserPreferences } from "@/server/db/schema";

/** The user allowed their data to go to the AI provider (asked once, revocable in Settings). */
export const aiAllowed = (prefs: UserPreferences | undefined | null) => !!prefs?.aiConsentAt;

export const AI_CONSENT_NEEDED = "Allow Jarvis to use AI first (Settings → Jarvis).";
