import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One green theme (vision section 13, audit A23): pages use the theme tokens in globals.css
 * (bg-accent, bg-accent-soft, bg-hero, text-accent ...), never their own hex colours or Tailwind's palette.
 */
const APP = path.resolve(__dirname, "../../src/app");

// Places that must name an exact colour, and why.
const ALLOWED: Record<string, string> = {
  "manifest.ts": "the installed app's theme and background colour must be literal values",
  "layout.tsx": "the browser chrome colour (theme-color meta) must be a literal value",
  "(app)/settings/security/page.tsx": "Google's sign-in button colours are fixed by Google's brand rules",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z-])/g;
const PALETTE =
  /\b(?:bg|text|from|via|to|border|ring|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;

describe("one green theme", () => {
  it("has no hard-coded hex colours or palette classes in src/app outside the commented exceptions", () => {
    const found: string[] = [];
    for (const f of files(APP)) {
      const rel = path.relative(APP, f).split(path.sep).join("/");
      if (rel in ALLOWED) continue;
      const text = readFileSync(f, "utf8");
      for (const m of [...(text.match(HEX) ?? []), ...(text.match(PALETTE) ?? [])]) found.push(`${rel}: ${m}`);
    }
    expect(found).toEqual([]);
  });

  it("keeps the exceptions real (each file exists and still needs it)", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = readFileSync(path.join(APP, rel), "utf8");
      expect(text.match(HEX), rel).not.toBeNull();
    }
  });
});
