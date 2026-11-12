// Plays Sky Relay with the bot in a headless browser at phone size: fails on page errors, prints each round's result
// and frame timing, and saves screenshots of every leg. Usage: node docs/design/2026-11-12-sky-relay/check.mjs [rounds] [speed] [shotsDir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rounds = Number(process.argv[2] || 3);
const speed = Number(process.argv[3] || 6);
const shots = process.argv[4];
const url = pathToFileURL(join(here, "sky-relay.html")).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${url}?bot=1&speed=${shots ? 1 : speed}${shots ? "&slow=1" : ""}`);
if (shots) await page.screenshot({ path: join(shots, "0-start.png") });
for (let r = 0; r < rounds; r++) {
  await page.evaluate((m) => window.__sr.play(m), r === 0 ? "today" : "any");
  if (shots && r === 0) {
    for (const [i, t] of [
      [1, 8],
      ["1b-banner", 18.3],
      [2, 27],
      [3, 45],
      ["3b-banner", 54.3],
      [4, 64],
      [5, 82],
    ]) {
      await page.waitForFunction((t) => window.__sr.G.t > t, t, { timeout: 120000 });
      await page.screenshot({ path: join(shots, `${i}-leg.png`) });
    }
  }
  await page.waitForFunction(() => window.__sr.state === "end", null, { timeout: 200000 });
  const rec = await page.evaluate(() => window.__sr.last);
  console.log(
    JSON.stringify({
      score: rec.score,
      legs: rec.legs,
      chain: rec.longestChain,
      lit: rec.lit,
      perfects: rec.perfects,
      storms: rec.storms,
      pops: rec.pops,
      shapes: rec.consts,
      falls: rec.falls,
      legFalls: rec.legFalls,
      zaps: rec.zaps,
      lines: rec.lines,
      fps: rec.fps,
      worst: rec.worstFrameMs,
      twist: rec.twist,
    }),
  );
  if (shots && r === 0) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(shots, "6-end.png") });
  }
}
await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("No page errors.");
