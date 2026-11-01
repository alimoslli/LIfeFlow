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
