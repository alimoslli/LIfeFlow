import { appendFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { makeToolContext } from "@/server/jarvis/agent";
import { executeToolCall } from "@/server/jarvis/executor";
import { toolSpecs, toolSpecsFor } from "@/server/jarvis/registry";
import { routeSkills, SKILLS } from "@/server/jarvis/skills";
import { selectToolGroups } from "@/server/jarvis/tool-select";
import type { SessionUser } from "@/server/auth/sessions";
import { seedEvalStudent } from "../fixtures/eval-student";
import { EVAL, EVAL_NOW } from "../fixtures/jarvis-eval";

afterAll(closeDb);

let session: SessionUser;
let conversationId: string;

beforeAll(async () => {
  ({ session, conversationId } = await seedEvalStudent());
}, 120_000);

describe("Jarvis eval: right skill, fewest tool calls, real facts", () => {
  it("has 10+ questions", () => expect(EVAL.length).toBeGreaterThanOrEqual(10));

  for (const c of EVAL) {
    it(`${c.id}: ${c.question}`, async () => {
      const routed = routeSkills(c.question).map((s) => s.name);
      expect(routed[0], "routes to the expected skill first").toBe(c.skill);

      // Jarvis is sent only the tool groups this question needs: they must still cover the whole plan, at a fraction of the size.
      const sent = toolSpecsFor(selectToolGroups({ text: c.question, skills: routeSkills(c.question), history: [{ type: "user", text: c.question }] }));
      for (const step of c.plan)
        expect(
          sent.map((t) => t.name),
          `${step.tool} is sent`,
        ).toContain(step.tool);
      expect(JSON.stringify(sent).length).toBeLessThan(JSON.stringify(toolSpecs()).length * 0.5);

      const skill = SKILLS.find((s) => s.name === c.skill)!;
      for (const step of c.plan) expect(skill.tools, `${c.skill} allows ${step.tool}`).toContain(step.tool);
      expect(c.plan.length).toBeLessThanOrEqual(c.budget);

      const ctx = makeToolContext(session, conversationId, EVAL_NOW, c.question);
      const outputs: unknown[] = [];
      for (const [i, step] of c.plan.entries()) {
        const out = await executeToolCall(step.tool, JSON.stringify(step.args), ctx, `${c.id}-${i}`);
        expect(out.kind).toBe("result");
        expect(out.result.ok, JSON.stringify(out.result).slice(0, 400)).toBe(true);
        outputs.push(out.result);
      }
      const text = JSON.stringify(outputs);
      if (process.env.EVAL_PRINT) appendFileSync(process.env.EVAL_PRINT, `\n### ${c.id}\n${JSON.stringify(outputs, null, 1)}\n`);
      for (const f of c.facts) expect(text, `tool results include "${f}"`).toContain(f);
      expect(c.answer).not.toMatch(/—/);
    });
  }
});
