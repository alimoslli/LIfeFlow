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
  // the v3 mark (components/brand/brand-mark.tsx): the day above the horizon with the sun's face, the night below with a
  // moon and two stars
  const svgMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a76d0"/><stop offset=".7" stop-color="#8cc0f0"/><stop offset="1" stop-color="#ffd4a0"/></linearGradient><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13284d"/><stop offset="1" stop-color="#071226"/></linearGradient><clipPath id="c"><circle cx="50" cy="50" r="46"/></clipPath><clipPath id="t"><rect width="100" height="52"/></clipPath></defs><g clip-path="url(#c)"><rect width="100" height="52" fill="url(#d)"/><rect y="52" width="100" height="48" fill="url(#n)"/><circle cx="50" cy="54" r="19" fill="#f5a524" clip-path="url(#t)"/><circle cx="43.5" cy="44" r="2.6" fill="#0f1a2a"/><circle cx="56.5" cy="44" r="2.6" fill="#0f1a2a"/><rect y="50.5" width="100" height="3" fill="#fff"/><path d="M66 63 a8 8 0 1 0 5.5 13.6 a6.2 6.2 0 1 1 -5.5 -13.6 z" fill="#e6edf8"/></g></svg>`;
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
