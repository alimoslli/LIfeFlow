import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSkills, renderIndex } from "../../scripts/build-skills";
import { ALL_TOOLS } from "@/server/jarvis/registry";
import { routeSkills, SKILLS } from "@/server/jarvis/skills";

describe("Jarvis skills", () => {
  it("the generated index matches the skill folders (run `npm run skills`)", () => {
    expect(readFileSync(join(process.cwd(), "src/server/jarvis/skills/index.generated.ts"), "utf8")).toBe(renderIndex(readSkills()));
  });

  it("every skill has instructions, 5+ evals and only real tools", () => {
    const tools = new Set(ALL_TOOLS.map((t) => t.name));
    for (const s of SKILLS) {
      expect(s.body, s.name).toMatch(/## Steps/);
      expect(s.evals.length, s.name).toBeGreaterThanOrEqual(5);
      for (const t of s.tools) expect(tools.has(t), `${s.name} uses unknown tool ${t}`).toBe(true);
    }
  });

  it("routes every eval prompt to its skill", () => {
    const misses = SKILLS.flatMap((s) =>
      s.evals
        .filter((e) => !routeSkills(e.prompt).some((x) => x.name === s.name))
        .map(
          (e) =>
            `${s.name}: "${e.prompt}" -> ${
              routeSkills(e.prompt)
                .map((x) => x.name)
                .join(", ") || "none"
            }`,
        ),
    );
    expect(misses).toEqual([]);
  });

  it("small talk doesn't pick a skill", () => {
    expect(routeSkills("hi")).toEqual([]);
    expect(routeSkills("thanks!")).toEqual([]);
  });
});
