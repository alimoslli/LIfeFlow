const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, storageState: path.join(__dirname, "probe/state.json") });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-11-09T19:29:00Z") });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
  await page.clock.pauseAt(new Date("2026-11-09T19:30:00Z")); await page.clock.runFor(2000);
  const dc = await page.locator('[data-testid="day-clock"]').boundingBox();
  const clip = { x: 0, y: dc.y, width: 430, height: 430 };
  let n = 0; const log = [];
  const shot = async (tag) => { n++; await page.screenshot({ path: path.join(out, `${String(n).padStart(4, "0")}.jpg`), clip, type: "jpeg", quality: 92 }); log.push(tag); };
  const tick = async (tag, k) => { for (let i = 0; i < k; i++) { await page.clock.runFor(1000 / 30); await shot(tag); } };
  await page.locator('[data-dc="hit"]').click({ noWaitAfter: true }); await tick("open", 45);
  // slide back to the morning and hold there
  await page.mouse.move(40, 260); await page.mouse.down();
  for (let i = 1; i <= 36; i++) { await page.mouse.move(40 + i * 10.5, 260); await page.clock.runFor(1000 / 30); await shot("past"); }
  await tick("pasthold", 24);
  // carry on: drag forward without letting go, then a flick ahead
  for (let i = 1; i <= 30; i++) { await page.mouse.move(418 - i * 13, 260); await page.clock.runFor(1000 / 30); await shot("fwd"); }
  await page.mouse.up(); await tick("fling", 30);
  await page.mouse.move(415, 262); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(415 - i * 45, 262); await page.clock.runFor(1000 / 30); await shot("flick"); }
  await page.mouse.up(); await tick("coast", 50);
  fs.writeFileSync(path.join(out, "tags.json"), JSON.stringify(log)); console.log("frames", n);
  await browser.close();
})();
