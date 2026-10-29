/** A Jarvis skill, compiled from skills/<name>/SKILL.md (see scripts/build-skills.ts). */
export type SkillFile = {
  name: string;
  title: string;
  description: string;
  /** Lowercase words or phrases in a request that call for this skill. */
  triggers: string[];
  /** Pages where it's more likely to be wanted. */
  modules: string[];
  /** Tools the skill relies on (names from the registry). */
  tools: string[];
  /** Steps, quality rules and an example, sent to the model when the skill is picked. */
  body: string;
  evals: { prompt: string; expect: string }[];
};
