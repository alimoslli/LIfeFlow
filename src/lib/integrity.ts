/**
 * Academic integrity (ADR 0016). Jarvis is a strict coach: he plans, explains with
 * other examples, quizzes, finds sources and comments on the student's own work,
 * but never produces work to hand in. This detector spots requests that look like
 * graded work so the prompt can switch to coach mode for that turn. It errs on the
 * side of coaching; the always-on rules in the instructions still apply either way.
 */
const DO_IT = /\b(write|do|finish|complete|solve|answer|draft|generate|code|make|give me|fill (in|out))\b/;
const GRADED =
  /\b(essay|paper|homework|hw|assignment|problem set|pset|worksheet|lab report|discussion (post|board|questions?)|thesis|questions? \d|problems? \d|exam|quiz|test|midterm|final|take-?home|prompt|reflection|report|response|annotated bibliography|research paper|coding assignment|project)\b/;
const MINE = /\b(my|this|these|the|for me|for my|due)\b/;
const CHEAT = [
  /\b(rewrite|reword|paraphrase|spin)\b.*\b(plagiari[sz]|turnitin|detect|ai detector|so it (isn'?t|is not) (flagged|detected))\b/,
  /\b(avoid|bypass|beat|get past|pass)\b.*\b(turnitin|plagiarism|ai detector|gptzero)\b/,
  /\b(is it|is the answer|which (one|answer) is (right|correct)|check (if )?my answer)\b.*\b([a-e]|true|false)\b.*\b(question|quiz|exam|test|homework)?/,
  /\b(during|in the middle of|while (i'?m |i am )?taking)\b.*\b(exam|quiz|test)\b/,
  /\b(open|live|timed)\s+(exam|quiz|test)\b/,
  /\bjust (give|tell) me the answers?\b/,
  /\b(example|sample|model) (essay|answer|paper|response)\b.*\b(i can|to) (use|submit|turn in|copy)\b/,
  /\b(turn in|submit|hand in)\b/,
];
const LEARNING =
  /\b(explain|how (do|does|would)|why|help me (understand|study|plan|outline my|brainstorm)|quiz me|teach|what does .* mean|study plan|break .* into steps|schedule|remind|due date|deadline|cite|citation|sources? (for|on|about)|feedback on my|comment on my|outline from my|plan (my|time|study))\b/;

export function looksLikeGradedWork(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  if (CHEAT.some((r) => r.test(t))) return true;
  if (LEARNING.test(t) && !/\b(write|solve|answer|do) (it|this|them|my|the)\b.*\bfor me\b/.test(t)) return false;
  return DO_IT.test(t) && GRADED.test(t) && MINE.test(t);
}

/** Added to the prompt for this turn when the request looks like graded work. */
export const COACH_MODE = `# Coach mode for this request
This looks like graded schoolwork. Do not produce anything the student would hand in, and do not give or check answers to graded questions. Say so in one friendly sentence, then help them do it themselves: break it into steps, explain the concept with a different example, ask a guiding question, find sources, or offer to comment on their own draft.`;
