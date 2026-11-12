// Plays Starlight with the bot in a headless browser at phone size: fails on page errors or on any moment where a
// player standing on a star had no way up ("stuck"), prints each run, and can save screenshots.
// Usage: node docs/design/2026-11-12-starlight/check.mjs [runs] [speed] [shotsDir]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] || 4);
const speed = Number(process.argv[3] || 6);
const shots = process.argv[4];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${pathToFileURL(join(here, "starlight.html")).href}?bot=${process.env.BOT || 1}&cap=300&speed=${shots ? 1 : speed}`);
if (shots) await page.screenshot({ path: join(shots, "s0-start.png") });
let stuck = 0;
for (let r = 0; r < n; r++) {
  await page.evaluate(() => window.__sl.play());
  if (shots && r === 0)
    for (const t of [0, 9, 30, 60]) {
      await page.waitForFunction((t) => window.__sl.state !== "play" || window.__sl.G.clock >= t, t, { timeout: 200000 });
      if (window.__sl_state === "end") break;
      await page.screenshot({ path: join(shots, `s-${t}.png`) });
    }
  await page.waitForFunction(() => window.__sl.state === "end", null, { timeout: 600000 });
  const rec = await page.evaluate(() => window.__sl.last);
  stuck += rec.stuck;
  console.log(
    JSON.stringify({
      stars: rec.score,
      s: rec.seconds,
      m: rec.climbed,
      shapes: rec.shapes,
      broken: rec.broken,
      close: rec.close,
      waits: rec.dark,
      far: rec.far,

      stuck: rec.stuck,
      fps: rec.fps,
      worst: rec.worstFrameMs,
    }),
  );
  if (shots && r === 0) await page.screenshot({ path: join(shots, "s-end.png") });
}
await browser.close();
if (errors.length) console.error("Page errors:\n" + errors.join("\n"));
if (stuck) console.error(`Stuck ${stuck} times: the sky had no way up.`);
if (errors.length || stuck) process.exit(1);
console.log("No page errors, never stuck.");
