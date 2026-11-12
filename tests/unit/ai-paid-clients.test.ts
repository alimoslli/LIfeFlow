import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every paid AI call must go through a place that writes the usage record (ADR 0034). This fails when a new file creates an
 * OpenAI client or calls a paid endpoint, so a new paid path can't ship without being added here (and recorded).
 */
const PAID =
  /new OpenAI\(|\.responses\.create\(|\.responses\.stream\(|clientSecrets\.create\(|\.chat\.completions\.|\.embeddings\.create\(|\.audio\.(speech|transcriptions)\.|\.images\.generate\(|api\.openai\.com/;

// file -> why it may, and what writes its usage row
const ALLOWED: Record<string, string> = {
  "src/server/jarvis/providers/openai.ts": "the chat and text model; runJarvisTurn writes the row (agent.ts)",
  "src/server/integrations/web-search.ts": "web search; searchWeb writes the row",
  "src/server/services/inbox/extract.ts": "document reading; extractDocument writes the row",
  "src/server/services/finance/tidy.ts": "transaction tidying; openAiTidy writes the row",
  "src/server/jarvis/voice.ts": "the voice client secret; startVoiceSession holds the row, the call's end settles it",
  "src/components/jarvis/voice-call.tsx": "the browser's side of the voice call (audio goes to the voice service with the client secret)",
};

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("paid AI clients", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const files = walk(path.join(root, "src")).map((f) => path.relative(root, f));

  it("are created only in the files listed here", () => {
    const found = files.filter((f) => PAID.test(readFileSync(path.join(root, f), "utf8")));
    expect(found.filter((f) => !(f in ALLOWED))).toEqual([]);
  });

  it("every listed file still exists and still has a paid call (so the list can't go stale)", () => {
    for (const f of Object.keys(ALLOWED)) {
      expect(files, f).toContain(f);
      expect(PAID.test(readFileSync(path.join(root, f), "utf8")), f).toBe(true);
    }
  });

  it("each server file that makes a paid call writes a usage row, or names who does", () => {
    for (const f of [
      "src/server/integrations/web-search.ts",
      "src/server/services/inbox/extract.ts",
      "src/server/services/finance/tidy.ts",
      "src/server/jarvis/voice.ts",
    ])
      expect(readFileSync(path.join(root, f), "utf8"), f).toMatch(/recordAiQuiet/);
    expect(readFileSync(path.join(root, "src/server/jarvis/agent.ts"), "utf8")).toMatch(/recordAiQuiet/);
  });
});
