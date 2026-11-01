import type { SkillFile } from "./skills";

/**
 * How hard the model thinks on this turn ("auto" reasoning). Quick lookups and adds stay fast and cheap;
 * advice, decisions and plans think more; files and big multi-part plans think most. One level per turn.
 */
export type Effort = "low" | "medium" | "high";

/** Skills whose answers are judgement calls (plans, money decisions, coaching), not lookups. */
const THINKING_SKILLS = new Set([
  "daily-planner",
  "smart-scheduler",
  "budget-coach",
  "purchase-advisor",
  "savings-goals",
  "paycheck-planner",
  "subscription-hunter",
  "task-breakdown",
  "weekly-review",
  "comparison",
  "career-helper",
  "tutor",
  "writing-helper",
]);

const DEEP =
  /semester|whole (week|month)|all (of )?my (classes|assignments|bills|courses|tasks)|step by step|in detail|thorough|deep dive|long[- ]term|full plan/;
const THINK =
  /should i|help me (decide|plan|figure|choose|budget|save|organi[sz]e|prioriti[sz]e)|\bplan (my|out|a|the)\b|compare|which (one|is better|should)|\bwhy\b|best way|strateg|prioriti|reorgani|figure out|what if|worth it|advice|\bcan i afford|on track|cut back|how (do|can|should) i|study plan|help me (study|prepare|prep)|quiz me|find (me )?(time|\d+ hours?)|reschedul/;

export function chooseEffort(i: { text: string; skills: SkillFile[]; hasFiles: boolean; coachMode: boolean }): Effort {
  const t = i.text.toLowerCase();
  if (i.hasFiles || t.length > 600 || DEEP.test(t)) return "high";
  if (i.coachMode || THINK.test(t) || i.skills.some((s) => THINKING_SKILLS.has(s.name))) return "medium";
  return "low";
}
