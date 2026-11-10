// The fuller day, real app, cropped card (no phone): Today, a turn into the evening, back to now, open the day,
// slide back to the morning (what happened), slide ahead to tonight and tomorrow (what's next).
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
  const drag = async (tag, x0, y, dx, steps) => { await page.mouse.move(x0, y); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (dx * i) / steps, y); await page.clock.runFor(1000 / 30); await shot(tag); } await page.mouse.up(); };
  await tick("idle", 45);
  await drag("turn", 335, dc.y + 230, -260, 40); await tick("turn", 20);
  const back = page.locator('[data-dc="back"]');
  if (await back.isVisible().catch(() => false)) { await back.click({ noWaitAfter: true }).catch(() => {}); }
  await tick("back", 30);
  await page.locator('[data-dc="hit"]').click({ noWaitAfter: true }); await tick("open", 45);
  await drag("past", 120, 260, 330, 40); await tick("past", 25);
  await drag("next", 380, 260, -600, 55); await tick("next", 25);
  fs.writeFileSync(path.join(out, "tags.json"), JSON.stringify(log));
  console.log("frames", n);
  await browser.close();
})();
