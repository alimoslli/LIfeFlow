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
  const mark = `data:image/png;base64,${readFileSync("public/brand/lifeflow-mark-192.png").toString("base64")}`;
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
