import type { UserPreferences } from "@/server/db/schema";

export type LifeStage = NonNullable<UserPreferences["lifeStage"]>;
export type LifeAreas = { school: boolean; work: boolean };

/** Which parts of the app the user sees. Unknown (older accounts) shows everything; hidden parts keep their data. */
export function lifeAreas(stage: UserPreferences["lifeStage"]): LifeAreas {
  return { school: stage !== "working" && stage !== "life", work: stage !== "student" && stage !== "life" };
}

/** Three things to try with Jarvis first, picked for the user's week. */
export function starterIdeas(stage: UserPreferences["lifeStage"]): string[] {
  const a = lifeAreas(stage);
  return [
    a.school ? "Here's my syllabus. Add every due date." : "What do I have going on this week?",
    a.work ? "Add my shifts from this screenshot of my schedule." : "Remind me to call home on Sunday at 6.",
    "Where did my money go this month?",
  ];
}

/** One "Try this" a day on Today, from what fits the user's week. */
export function tryThisIdea(stage: UserPreferences["lifeStage"], dayNumber: number): { title: string; prompt: string } {
  const a = lifeAreas(stage);
  const ideas = [
    ...(a.school
      ? [
          { title: "Turn a syllabus into deadlines", prompt: "Here's my syllabus. Add every due date and exam." },
          { title: "Plan study time for your next exam", prompt: "Plan study time for my next exam in my free time this week." },
          { title: "Get quizzed before a test", prompt: "Quiz me on my next exam's topics, one question at a time." },
        ]
      : []),
    ...(a.work
      ? [
          { title: "Add shifts from a screenshot", prompt: "Add my shifts from this screenshot of my schedule." },
          { title: "Check your paycheck", prompt: "Does my last paycheck match the hours I worked?" },
        ]
      : []),
    { title: "See where your money went", prompt: "Where did my money go this month?" },
    { title: "Find subscriptions you forgot", prompt: "Find subscriptions I might have forgotten about." },
    { title: "Plan your week in one go", prompt: "Look at my week and tell me the three things to get ahead on." },
    { title: "Set a savings goal", prompt: "Help me set a savings goal and a weekly amount I can actually keep." },
  ];
  return ideas[Math.abs(dayNumber) % ideas.length];
}
