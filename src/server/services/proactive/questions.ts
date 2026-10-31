import { and, desc, eq, like } from "drizzle-orm";
import { jarvisMessages, type MemoryCategory, type UserPreferences } from "../../db/schema";
import { series } from "../../db/series";
import type { UserScope } from "../../db/with-user";
import { listCourses } from "../school";
import { listEmployers } from "../work";
import type { Candidate } from "./detectors";

/**
 * Get-to-know questions (ADR 0012). Asked only with learning consent, one at a
 * time, each once, every couple of days. They skip what Jarvis already knows
 * (a saved answer, or the user's own records) and fit the user's life: a class
 * question only for students with classes, a job question only for workers.
 * Nothing about health, religion, politics, relationships, exact income,
 * addresses or account details. The answer is saved as a memory the user added,
 * so it's editable and deletable in What Jarvis knows.
 */

export type Known = { student: boolean; worker: boolean; courses: string[]; employers: number };
export type Question = {
  key: string;
  ask: string;
  choices: string[] | ((k: Known) => string[]);
  /** The saved memory. Its text up to the colon is how we recognise it's already known. */
  memory: (answer: string) => string;
  category: MemoryCategory;
  topic?: "money" | "school" | "work";
  when?: (k: Known) => boolean;
};

const lower = (a: string) => a.charAt(0).toLowerCase() + a.slice(1);

/** In order of how much the answer helps Jarvis plan. */
export const QUESTIONS: Question[] = [
  {
    key: "semester_win",
    ask: "What would make this semester a win for you?",
    choices: ["Better grades", "Less stress", "Never missing a deadline", "Balancing work and school"],
    memory: (a) => `What would make this semester a win: ${lower(a)}.`,
    category: "goal",
    topic: "school",
    when: (k) => k.student,
  },
  {
    key: "put_off",
    ask: "What usually makes you put things off?",
    choices: ["Not knowing where to start", "Too tired after work or class", "My phone", "The task feels too big"],
    memory: (a) => `What usually makes me put things off: ${lower(a)}.`,
    category: "preference",
  },
  {
    key: "focus_time",
    ask: "When do you focus best?",
    choices: ["Early morning", "Afternoon", "Evening", "Late at night"],
    memory: (a) => `I focus best: ${lower(a)}.`,
    category: "routine",
  },
  {
    key: "heaviest_class",
    ask: "Which class needs the most of your time right now?",
    choices: (k) => k.courses.slice(0, 4),
    memory: (a) => `The class that needs the most of my time: ${a}.`,
    category: "fact",
    topic: "school",
    when: (k) => k.courses.length >= 2,
  },
  {
    key: "has_job",
    ask: "Do you work while you're in school?",
    choices: ["Yes, part-time", "Yes, full-time", "Not right now", "Looking for work"],
    memory: (a) => `Working while in school: ${lower(a)}.`,
    category: "fact",
    topic: "work",
    when: (k) => k.student && k.employers === 0,
  },
  {
    key: "work_hours",
    ask: "About how many hours do you work in a usual week?",
    choices: ["Under 10", "10 to 20", "20 to 30", "More than 30"],
    memory: (a) => `Hours I work in a usual week: ${lower(a)}.`,
    category: "routine",
    topic: "work",
    when: (k) => k.worker,
  },
  {
    key: "nudge_style",
    ask: "When you fall behind, how should I nudge you?",
    choices: ["Gently", "Be direct with me", "Break it into small steps", "Just show me the plan"],
    memory: (a) => `When I fall behind, nudge me: ${lower(a)}.`,
    category: "preference",
  },
  {
    key: "reminder_time",
    ask: "When do reminders help you most?",
    choices: ["The night before", "The morning of", "An hour before"],
    memory: (a) => `Reminders help me most: ${lower(a)}.`,
    category: "preference",
  },
  {
    key: "money_goal",
    ask: "What's your biggest money goal this year?",
    choices: ["Build an emergency fund", "Pay off debt", "Save for a trip", "Start investing"],
    memory: (a) => `My biggest money goal this year: ${lower(a)}.`,
    category: "goal",
    topic: "money",
  },
  {
    key: "payday",
    ask: "How often do you get paid?",
    choices: ["Every week", "Every two weeks", "Twice a month", "It changes"],
    memory: (a) => `How often I get paid: ${lower(a)}.`,
    category: "routine",
    topic: "money",
    when: (k) => k.worker,
  },
  {
    key: "getting_around",
    ask: "How do you usually get to class or work?",
    choices: ["Drive", "Bus or train", "Walk or bike", "Mostly online"],
    memory: (a) => `How I usually get to class or work: ${lower(a)}.`,
    category: "routine",
  },
  {
    key: "bedtime",
    ask: "When do you usually go to bed on a weeknight?",
    choices: ["Before 11 PM", "11 PM to 1 AM", "After 1 AM", "It changes a lot"],
    memory: (a) => `When I usually go to bed on a weeknight: ${lower(a)}.`,
    category: "routine",
  },
  {
    key: "study_style",
    ask: "How do you study best?",
    choices: ["Short sessions with breaks", "Long focused blocks", "With friends", "With music on"],
    memory: (a) => `How I study best: ${lower(a)}.`,
    category: "preference",
    topic: "school",
    when: (k) => k.student,
  },
  {
    key: "spending_nudges",
    ask: "How should I bring up spending?",
    choices: ["Right away", "In the weekly review", "Only when I'm over budget"],
    memory: (a) => `Bring up spending: ${lower(a)}.`,
    category: "preference",
    topic: "money",
  },
  {
    key: "weekends",
    ask: "What do your weekends usually look like?",
    choices: ["Work shifts", "Catching up on school", "Rest and friends", "It changes every week"],
    memory: (a) => `My weekends are usually: ${lower(a)}.`,
    category: "routine",
  },
  {
    key: "after_school",
    ask: "What are you working toward after school?",
    choices: ["A specific career", "Grad school", "Starting something of my own", "Still figuring it out"],
    memory: (a) => `What I'm working toward after school: ${lower(a)}.`,
    category: "goal",
    when: (k) => k.student,
  },
  {
    key: "recharge",
    ask: "What helps you recharge after a long day?",
    choices: ["Time with friends", "Games or shows", "Working out", "Quiet time alone"],
    memory: (a) => `What helps me recharge: ${lower(a)}.`,
    category: "preference",
  },
  {
    key: "motivation",
    ask: "What keeps you going when things pile up?",
    choices: ["Seeing my progress", "A clear plan for the day", "Small rewards", "Someone checking in"],
    memory: (a) => `What keeps me going: ${lower(a)}.`,
    category: "preference",
  },
];

export const questionByKey = (key: string) => QUESTIONS.find((q) => q.key === key);
const prefix = (q: Question) => q.memory("x").split(":")[0];

/** Questions worth asking now: not asked before, not already known, and fitting this user's life. */
export async function openQuestions(scope: UserScope, prefs: UserPreferences | undefined, memories: { content: string }[], opts: { money?: boolean } = {}) {
  const [asked, courses, employers] = await series(
    () =>
      scope.tx
        .select({ key: jarvisMessages.dedupeKey, at: jarvisMessages.createdAt })
        .from(jarvisMessages)
        .where(and(eq(jarvisMessages.userId, scope.userId), like(jarvisMessages.dedupeKey, "question:%")))
        .orderBy(desc(jarvisMessages.createdAt)),
    () => listCourses(scope),
    () => listEmployers(scope),
  );
  const stage = prefs?.lifeStage;
  const known: Known = {
    student: stage ? stage === "student" || stage === "both" : courses.length > 0,
    worker: stage ? stage === "working" || stage === "both" : employers.length > 0,
    courses: courses.map((c) => c.code || c.name),
    employers: employers.length,
  };
  const done = new Set(asked.map((a) => a.key.slice("question:".length)));
  const saved = memories.map((m) => m.content.toLowerCase());
  const questions = QUESTIONS.filter(
    (q) =>
      !done.has(q.key) &&
      (q.when?.(known) ?? true) &&
      (opts.money !== false || q.topic !== "money") &&
      !saved.some((s) => s.startsWith(prefix(q).toLowerCase())),
  ).map((q) => ({ ...q, choices: typeof q.choices === "function" ? q.choices(known) : q.choices }));
  return { questions, lastAskedAt: asked[0]?.at ?? null };
}

/** The next question for Updates, at most one every 2 days. */
export async function nextQuestion(
  scope: UserScope,
  now: Date,
  prefs?: UserPreferences,
  memories: { content: string }[] = [],
  opts: { money?: boolean } = {},
): Promise<Candidate | null> {
  const { questions, lastAskedAt } = await openQuestions(scope, prefs, memories, opts);
  if (lastAskedAt && now.getTime() - lastAskedAt.getTime() < 2 * 86_400_000) return null;
  const q = questions[0];
  if (!q) return null;
  return {
    kind: "question",
    topic: q.topic === "money" ? "money" : q.topic === "school" ? "school" : "general",
    dedupeKey: `question:${q.key}`,
    facts: { question: q.ask },
    action: { type: "answer", label: "Answer", key: q.key, choices: q.choices },
    priority: 30,
  };
}
