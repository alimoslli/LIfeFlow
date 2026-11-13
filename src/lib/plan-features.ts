import { FREE_JARVIS_PER_DAY } from "@/server/billing";

/**
 * What each plan card promises (owner, 2026-11-13: "the free has too many features that we can't afford; that's for the $5.99
 * student plan and the $9.99 normal plan"). The one list the plan page reads.
 *
 * FREE: only what costs nothing per use, plus the 15 messages a day (a fixed, small cap we can carry for everyone).
 * PAID: anything with a per-use cost (the skyling's model, text messages, a bank or calendar connection, reading documents and
 * photos with the model) and anything we promise a paying student or person. A feature we couldn't tell the cost of goes here too
 * (see UNSURE) until the owner says.
 */
export const FREE_MESSAGES_PER_DAY = FREE_JARVIS_PER_DAY; // one constant: the chat limit in billing.ts

export const FREE_FEATURES: readonly string[] = [
  `${FREE_MESSAGES_PER_DAY} messages with your skyling a day`,
  "Everything you add yourself: to-dos, calendar, shifts and notes",
];

export const PAID_FEATURES: readonly string[] = [
  "More messages with your skyling every month",
  "Bank and card sync",
  "Gmail and Google Calendar",
  "Microsoft Teams and Outlook",
  "Canvas sync",
  "Text your skyling from your phone",
  "Talk to your skyling by voice",
  "Reading your documents and photos",
  "Your weekly review",
];

/** Features whose per-use cost isn't known yet: shown on the paid cards only, listed for the owner to decide. */
export const UNSURE: readonly string[] = ["Reading your documents and photos", "Your weekly review"];

export const STUDENT_FEATURES: readonly string[] = PAID_FEATURES;
export const STANDARD_FEATURES: readonly string[] = PAID_FEATURES;

/** Words that mean a per-use cost; none may appear on the free card. */
export const AI_COST_WORDS = /more messages|voice|text your|document|photo|weekly review|bank|gmail|google|microsoft|canvas/i;
