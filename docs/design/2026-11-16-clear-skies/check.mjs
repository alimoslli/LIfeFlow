// Plays Clear Skies with the bot in a headless browser at phone size: every night a few times (wins, moons, moves),
// then Endless. Fails on page errors. BOT=human plays one move ahead with slips; the default looks two moves ahead.
// Usage: node docs/design/2026-11-16-clear-skies/check.mjs [tries per night] [endless runs] [speed]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const tries = Number(process.argv[2] ?? 3);
const endless = Number(process.argv[3] ?? 1);
const speed = Number(process.argv[4] || 60);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${pathToFileURL(join(here, "clear-skies.html")).href}?bot=${process.env.BOT || 1}&cap=400&speed=${speed}`);
const run = async (mode, night) => {
  await page.evaluate(([m, n]) => window.__cs.play(m, n), [mode, night]);
  await page.waitForFunction(() => window.__cs.state === "end", null, { timeout: 300000 });
  return page.evaluate(() => window.__cs.last);
};
for (let n = 0; n < 8 && tries; n++) {
  const out = [];
  for (let t = 0; t < tries; t++) {
    const r = await run("night", n);
    out.push(r.won ? `won ${r.moons}m/${r.moves}` : `lost/${r.moves}`);
  }
  console.log(`night ${n + 1}: ${out.join("  ")}`);
}
for (let t = 0; t < endless; t++) {
  const r = await run("endless", 0);
  console.log(
    `endless: score ${r.score} moves ${r.moves} lines ${r.lines} combos ${r.doubles + r.triples + r.bursts} dashes ${r.dashes} gold ${r.gold} winds ${r.winds} fps ${r.fps}`,
  );
}
await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("No page errors.");
