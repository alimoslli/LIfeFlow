/**
 * Why an answer got a thumbs-down: one tap, a fixed list, never typed words (so nothing of the chat is stored with it).
 * The four are the owner's own complaints when he graded answers on 2026-11-26: too long, wrong, said it without doing it,
 * answered something else.
 */
export const RATING_REASONS = ["too_long", "wrong", "not_done", "off_point"] as const;
export type RatingReason = (typeof RATING_REASONS)[number];

export const RATING_REASON_LABELS: Record<RatingReason, string> = {
  too_long: "Too long",
  wrong: "Got it wrong",
  not_done: "Didn't do it",
  off_point: "Missed the point",
};

export const isRatingReason = (x: unknown): x is RatingReason => typeof x === "string" && (RATING_REASONS as readonly string[]).includes(x);
