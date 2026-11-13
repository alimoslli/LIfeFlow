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

/**
 * Money never goes to the small model (owner's yes and the COO's rule, 2026-11-12: in the paid try-out the small model said
 * "groceries look fine" while the bills were larger than the balance). A low turn runs on the small model
 * (providers/openai.ts), so anything about money is at least medium: its words, a money skill, or a money tool group.
 */
const MONEY =
  /\$|\bmoney\b|\bspen[dt]|afford|budget|\bbills?\b|\bpa(y|id|ying)\b|paycheck|\bearn|\bmake\b|\bcosts?\b|price|balance|\bbank|subscri|charge|\bsav(e|es|ed|ing)\b|\bowe|debt|\brent\b|\bcash\b|zell|venmo|transaction|purchase|bought|\bbuy|refund|\bfees?\b|income|deposit|\bloan|credit|grocer|\btips?\b|\bwage|salary|\bdollars?\b|\bchecking\b|\bsavings\b|\baccounts? balance|\bnet worth/;
const MONEY_SKILLS = new Set(["budget-coach", "purchase-advisor", "savings-goals", "paycheck-planner", "subscription-hunter"]);

/**
 * A read-only question about the day, the week or what's due ("what do I need to get done today?", "which day is the
 * hardest?"): our tools have the facts and the small model only words them, so it goes to the small model even when its
 * skill is a planning one (owner's yes, 2026-11-12, from the paid try-out). Asking for a plan or advice is THINK, not this.
 */
const LOOKUP =
  /^(what('s| is| are| do i| have i| did i)|when('s| is| are| do i| does)|how many|do i have|which (day|class|one is due)|am i (free|busy|working)|is (there|anything)|anything)\b/;

export function chooseEffort(i: { text: string; skills: SkillFile[]; hasFiles: boolean; coachMode: boolean; moneyTools?: boolean }): Effort {
  const t = i.text.toLowerCase().trim();
  if (i.hasFiles || t.length > 600 || DEEP.test(t)) return "high";
  const money = !!i.moneyTools || MONEY.test(t) || i.skills.some((s) => MONEY_SKILLS.has(s.name));
  if (i.coachMode || THINK.test(t)) return "medium";
  if (money) return "medium";
  if (i.skills.some((s) => THINKING_SKILLS.has(s.name)) && !LOOKUP.test(t)) return "medium";
  return "low";
}
