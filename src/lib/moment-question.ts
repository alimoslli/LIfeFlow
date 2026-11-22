/**
 * The skyling asks the right question (owner, 2026-11-22: "any app will ask how are you feeling today, who will ask
 * something specific based on what we know, like how are you feeling after your shift, here's your star"). One question,
 * on a real moment that just ended (a star the person is claiming): a shift, a class or an exam. Never on a guess, never a
 * push, at most one a day across every question the skyling asks (`askedOn`), and skippable.
 *
 * The answer isn't kept as a history of feelings. "Rough" makes the rest of that day quieter (`easyUntil`), and "Worth
 * noting" opens the chat with the moment named, where the person decides what the skyling remembers.
 */

export type MomentStar = { key: string; title: string; kind: string };
export type MomentQuestion = { key: string; ask: string; note: string };

/** The answers, in the person's words. */
export const MOMENT_ANSWERS = ["Good", "Okay", "Rough"] as const;
export type MomentAnswer = (typeof MOMENT_ANSWERS)[number];

/** What a rough day turns quiet for the rest of it: coaching and nudges, never real trouble (a clash, a bill, a promise). */
export const QUIET_ON_EASY_DAYS = new Set([
  "evening_wrap",
  "goal_checkin",
  "goal_forecast",
  "habit_streak",
  "habit_struggle",
  "task_streak",
  "overdue_tasks",
  "start_earlier",
  "exam_study",
  "spending_pace",
  "question",
  "weekly_learned",
  "saved_more",
]);

/** The question for one moment, or none: plans and personal events aren't asked about. */
export function momentQuestion(s: MomentStar): MomentQuestion | null {
  const title = s.title.trim();
  if (!title) return null;
  if (s.kind === "work") return { key: s.key, ask: `How was the ${title} shift?`, note: `From my ${title} shift today: ` };
  if (s.kind === "exam") return { key: s.key, ask: `How did ${title} feel?`, note: `About ${title} today: ` };
  if (s.kind === "class") return { key: s.key, ask: `How was ${title} today?`, note: `From ${title} today: ` };
  return null;
}

/** The most recent moment worth asking about among the stars just claimed (the last one ended latest). */
export function pickMoment(stars: MomentStar[]): MomentQuestion | null {
  for (let i = stars.length - 1; i >= 0; i--) {
    const q = momentQuestion(stars[i]);
    if (q) return q;
  }
  return null;
}

/** What the skyling says back: short and warm, never advice it wasn't asked for. */
export function momentThanks(a: MomentAnswer): string {
  if (a === "Rough") return "Thanks for telling me. I'll keep tonight light.";
  if (a === "Okay") return "Got it. Thanks for telling me.";
  return "Love that. Thanks for telling me.";
}
