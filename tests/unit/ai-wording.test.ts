import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../..", f), "utf8");

describe("honest wording about limits (owner, 2026-11-12)", () => {
  it("the plan page and the chat limit message don't say unlimited or no daily limit", () => {
    const plan = read("src/app/(app)/settings/plan/page.tsx");
    const chat = read("src/app/api/jarvis/chat/route.ts");
    expect(plan).not.toMatch(/unlimited/i);
    expect(plan).toContain("More messages with your skyling");
    expect(chat).not.toMatch(/no daily limit/i);
    expect(chat).toContain("LifeFlow Pro has a much bigger daily allowance");
  });

  it("no user-facing file promises unlimited use of the skyling", () => {
    for (const f of ["src/server/billing.ts", "src/server/services/ai-limits.ts", "src/server/services/ai-gate.ts", "docs/plan-v2.md"])
      expect(read(f), f).not.toMatch(/unlimited (jarvis|messages|voice)/i);
  });
});
