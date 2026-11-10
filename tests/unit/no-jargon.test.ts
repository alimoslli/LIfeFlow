import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("internal wording never reaches the skyling's words", () => {
  it("no 'overload flag', thresholds or hourly pay estimates in skills, prompts, tools or detectors", () => {
    const files = [...walk("skills"), ...walk("src/server/jarvis"), ...walk("src/server/services/proactive"), "src/lib/jarvis-voice.ts"].filter((f) =>
      /\.(md|json|ts)$/.test(f),
    );
    const bad = /overload flag|25-hour|25 hour|about \$\d+ before tax/i;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(bad.test(text), `${f} has internal or pay-estimate wording`).toBe(false);
    }
  });
});
