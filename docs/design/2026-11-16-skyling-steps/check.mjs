// Plays Skyling Steps with the bot in a headless browser at phone size: fails on page errors, prints each run (steps,
// lines, combos, streaks, wishes, rewinds, clouds). BOT=human slips now and then; the default plans a few steps ahead.
// Usage: node docs/design/2026-11-16-skyling-steps/check.mjs [runs] [speed]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] || 4);
const speed = Number(process.argv[3] || 40);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${pathToFileURL(join(here, "skyling-steps.html")).href}?bot=${process.env.BOT || 1}&cap=700&speed=${speed}`);
for (let r = 0; r < n; r++) {
  await page.evaluate(() => window.__ss.play());
  await page.waitForFunction(() => window.__ss.state === "end", null, { timeout: 300000 });
  const rec = await page.evaluate(() => window.__ss.last);
  console.log(
    JSON.stringify({
      skyling: rec.skyling,
      score: rec.score,
      steps: rec.steps,
      lines: rec.lines,
      doubles: rec.doubles,
      triples: rec.triples,
      streak: rec.bestStreak,
      wishes: rec.wishes,
      rewinds: rec.rewinds,
      blown: rec.blown,
      clouds: rec.clouds,
      seconds: rec.seconds,
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
