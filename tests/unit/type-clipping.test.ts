import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Type that never clips (a reviewer of the landing page, 2026-11-17: "ascenders & descenders can clip with the
 * current lh"; the owner: "make sure errors like this are nowhere to be found"). Headings in the display face keep a
 * line height of at least 1.1, gradient words carry `lf-clip-text` so their italics and descenders are painted, and
 * the public pages carry no eyebrow labels over their headings.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}
const SOURCES = files("src").map((f) => ({ f, text: readFileSync(f, "utf8") }));
const classes = (text: string) => [...text.matchAll(/className=(?:\{cn\()?["`]([^"`]*)["`]/g)].map((m) => m[1]);

describe("type never clips", () => {
  it("display headings with words keep a line height of at least 1.1 (numbers may sit at 1: digits have no descenders)", () => {
    const tight = /\bleading-(none|\[(0\.\d+|1(\.0\d?)?)\])(?=\s|$)/;
    const bad = SOURCES.flatMap(({ f, text }) =>
      classes(text)
        .filter((c) => /\bfont-display\b/.test(c) && tight.test(c) && !/\b(tabular|lf-sw-num)\b/.test(c))
        .filter((c) => !(f.endsWith("theme-picker.tsx") && c.includes("leading-none"))) // the "Aa" sample swatch
        .map((c) => `${f}: ${c}`),
    );
    expect(bad).toEqual([]);
  });

  it("gradient words (bg-clip-text) carry lf-clip-text, so italics and descenders are painted", () => {
    const bad = SOURCES.flatMap(({ f, text }) =>
      classes(text)
        .filter((c) => /\bbg-clip-text\b/.test(c) && !/\blf-clip-text\b/.test(c))
        .map((c) => `${f}: ${c}`),
    );
    expect(bad).toEqual([]);
  });

  it("the landing, waitlist and sign-in pages have no eyebrow labels over their headings", () => {
    const pages = ["src/app/landing/page.tsx", "src/app/(onboarding)/waitlist/sky-explainer.tsx", "src/app/(auth)/layout.tsx"];
    const eyebrow = /tracking-\[0\.1[2-6]em\][^"]*uppercase[^"]*">[^<{]{3,}<\/p>\s*<h[12]/;
    const bad = pages.filter((p) => eyebrow.test(readFileSync(p, "utf8")) || /const kicker\b/.test(readFileSync(p, "utf8")));
    expect(bad).toEqual([]);
  });
});
