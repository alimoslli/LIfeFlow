import { SKILLS } from "./index.generated";
import type { SkillFile } from "./types";

export { SKILLS };
export type { SkillFile };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map(SKILLS.map((s) => [s.name, s.triggers.map((t) => ({ re: new RegExp(`(^|[^a-z])${escape(t)}`), weight: t.split(/\s+/).length }))]));

/**
 * Picks the skills for a request: trigger phrases at the start of a word ("habit" matches "habits"; longer phrases count more),
 * with a small boost on the page they belong to. At most `max`, and only clear matches.
 */
export function routeSkills(text: string, module?: string | null, max = 2): SkillFile[] {
  const t = text.toLowerCase();
  const scored = SKILLS.map((s) => {
    const hits = patterns.get(s.name)!.filter((p) => p.re.test(t));
    const score = hits.reduce((n, p) => n + p.weight, 0);
    return { s, score: score ? score + (module && s.modules.includes(module) ? 0.5 : 0) : 0 };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  return scored
    .filter((x) => x.score >= best / 2)
    .slice(0, max)
    .map((x) => x.s);
}
