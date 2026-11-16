// Plays Clear Skies with the bot in a headless browser at phone size: fails on page errors, prints each run (moves,
// lines, combos, longest slide, frame timing). BOT=human plays one move ahead with slips; the default looks two ahead.
// Usage: node docs/design/2026-11-16-clear-skies/check.mjs [runs] [speed]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] || 4);
const speed = Number(process.argv[3] || 20);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${pathToFileURL(join(here, "clear-skies.html")).href}?bot=${process.env.BOT || 1}&cap=500&speed=${speed}`);
for (let r = 0; r < n; r++) {
  await page.evaluate(() => window.__cs.play());
  await page.waitForFunction(() => window.__cs.state === "end", null, { timeout: 600000 });
  const rec = await page.evaluate(() => window.__cs.last);
  console.log(
    JSON.stringify({
      score: rec.score,
      moves: rec.moves,
      lines: rec.lines,
      doubles: rec.doubles,
      triples: rec.triples,
      bursts: rec.bursts,
      clearSkies: rec.clearSkies,
      longest: rec.longest,
      bumps: rec.bumps,
      fps: rec.fps,
    }),
  );
}
await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("No page errors.");
