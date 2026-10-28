import { and, desc, eq, like } from "drizzle-orm";
import { jarvisMessages, type MemoryCategory } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import type { Candidate } from "./detectors";

/**
 * Short get-to-know questions. Asked only with learning consent, one at a time,
 * at most every few days, each once. The answer is saved as a memory the user
 * added (so it's editable and deletable in Settings, What Jarvis knows).
 */

export type Question = { key: string; ask: string; choices: string[]; memory: (answer: string) => string; category: MemoryCategory };

export const QUESTIONS: Question[] = [
  {
    key: "money_goal",
    ask: "What's your biggest money goal this year?",
    choices: ["Build an emergency fund", "Pay off debt", "Save for a trip", "Start investing"],
    memory: (a) => `My biggest money goal this year: ${a.toLowerCase()}.`,
    category: "goal",
  },
  {
    key: "reminder_time",
    ask: "When do reminders help you most?",
    choices: ["The night before", "The morning of", "An hour before"],
    memory: (a) => `Reminders help me most ${a.toLowerCase()}.`,
    category: "preference",
  },
  {
    key: "focus_time",
    ask: "When do you focus best?",
    choices: ["Early morning", "Afternoon", "Evening", "Late at night"],
    memory: (a) => `I focus best: ${a.toLowerCase()}.`,
    category: "routine",
  },
  {
    key: "spending_nudges",
    ask: "How should I bring up spending?",
    choices: ["Right away", "In the weekly review", "Only when I'm over budget"],
    memory: (a) => `Spending nudges: ${a.toLowerCase()}.`,
    category: "preference",
  },
  {
    key: "weekends",
    ask: "What do your weekends usually look like?",
    choices: ["Work shifts", "Catching up on school", "Rest and friends", "It changes every week"],
    memory: (a) => `My weekends are usually: ${a.toLowerCase()}.`,
    category: "routine",
  },
  {
    key: "motivation",
    ask: "What keeps you going when things pile up?",
    choices: ["Seeing my progress", "A clear plan for the day", "Small rewards", "Someone checking in"],
    memory: (a) => `What keeps me going: ${a.toLowerCase()}.`,
    category: "preference",
  },
];

export const questionByKey = (key: string) => QUESTIONS.find((q) => q.key === key);

/** The next unasked question, if none was asked in the last 3 days. */
export async function nextQuestion(scope: UserScope, now: Date): Promise<Candidate | null> {
  const asked = await scope.tx
    .select({ key: jarvisMessages.dedupeKey, at: jarvisMessages.createdAt })
    .from(jarvisMessages)
    .where(and(eq(jarvisMessages.userId, scope.userId), like(jarvisMessages.dedupeKey, "question:%")))
    .orderBy(desc(jarvisMessages.createdAt));
  if (asked[0] && now.getTime() - asked[0].at.getTime() < 3 * 86_400_000) return null;
  const done = new Set(asked.map((a) => a.key.slice("question:".length)));
  const q = QUESTIONS.find((x) => !done.has(x.key));
  if (!q) return null;
  return {
    kind: "question",
    topic: "general",
    dedupeKey: `question:${q.key}`,
    facts: { question: q.ask },
    action: { type: "answer", label: "Answer", key: q.key, choices: q.choices },
    priority: 30,
  };
}
