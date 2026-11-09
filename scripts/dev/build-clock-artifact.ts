/**
 * Builds the v3 concept artifact (docs/design/clock/concept.html): the app's own day-clock engine and CSS, the app's
 * theme tokens, and a made-up week (scripts/dev/clock-artifact/entry.ts) in one self-contained page. Rebuild after any
 * clock change, then republish it to the owner's "LifeFlow Day Clock" artifact so the concept never drifts from the
 * branch.
 *
 *   npx tsx scripts/dev/build-clock-artifact.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUT = "docs/design/clock/concept.html";
// The emojis people pin most (the same row as the app's pin sheet).
const EMOJIS = ["📌", "✈️", "🎂", "💼", "📚", "📝", "🏋️", "🏃", "🍽️", "☕", "🎉", "🩺", "💳", "🛒", "🏠", "🚗", "🎬", "🎓", "🏁", "🎯"];

async function main() {
  const bundle = await build({
    entryPoints: ["scripts/dev/clock-artifact/entry.ts"],
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    target: "es2020",
    legalComments: "none",
    tsconfig: "tsconfig.json",
  });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const globals = readFileSync("src/app/globals.css", "utf8");
  const tokens = globals.slice(globals.indexOf(":root {"), globals.indexOf("/* Text size")).trim();
  const css = readFileSync("src/components/day-clock/day-clock.css", "utf8");
  // the v3 mark (components/brand/brand-mark.tsx): horizon, sun with a face, moon and two stars
  const svgMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="s"><rect width="100" height="52"/></clipPath></defs><circle cx="50" cy="52" r="40" fill="none" stroke="#5b4bd6" stroke-width="5" opacity=".35"/><circle cx="50" cy="58" r="26" fill="#f4a44a" clip-path="url(#s)"/><circle cx="42" cy="44" r="3" fill="#1b1736"/><circle cx="58" cy="44" r="3" fill="#1b1736"/><rect x="4" y="50" width="92" height="5" rx="2.5" fill="#5b4bd6"/><path d="M64 66 a9 9 0 1 0 6 15 a7 7 0 1 1 -6 -15 z" fill="#b3a8ff"/></svg>`;
  const mark = `data:image/svg+xml;base64,${Buffer.from(svgMark).toString("base64")}`;
  const emojis = EMOJIS.map((e) => `<button type="button" role="radio" aria-checked="false" aria-label="${e}" data-emoji="${e}">${e}</button>`).join("");
  // Function replacements: the bundle is full of "$" sequences a string replacement would read as patterns.
  const html = readFileSync("scripts/dev/clock-artifact/shell.html", "utf8")
    .replace("{{TOKENS}}", () => tokens)
    .replace("{{CLOCK_CSS}}", () => css)
    .replace("{{EMOJIS}}", () => emojis)
    .replaceAll("{{MARK}}", () => mark)
    .replace("{{JS}}", () => js);
  writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${Math.round(html.length / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
