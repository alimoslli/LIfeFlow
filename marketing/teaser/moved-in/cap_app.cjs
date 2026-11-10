// Captures the real Today sky (cropped card, no phone) on a fake clock: idle, a turn through sunset, the unroll.
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, storageState: path.join(__dirname, "probe/state.json") });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-11-09T19:29:00Z") });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
  await page.clock.pauseAt(new Date("2026-11-09T19:30:00Z"));
  await page.clock.runFor(1500);
  const dc = await page.locator('[data-testid="day-clock"]').boundingBox();
  const clip = { x: dc.x, y: dc.y, width: dc.width, height: 430 };
  let n = 0;
  const shot = async (tag) => { n++; await page.screenshot({ path: path.join(out, `${String(n).padStart(4, "0")}_${tag}.jpg`), clip, type: "jpeg", quality: 92 }); };
  const step = async (k, tag) => { for (let i = 0; i < k; i++) { await page.clock.runFor(1000 / 30); await shot(tag); } };
  await step(60, "idle");                                   // 2 s of the day sky
  const cx = dc.x + dc.width / 2, cy = dc.y + 230;
  await page.mouse.move(cx + 120, cy); await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(cx + 120 - i * 6.5, cy); await page.clock.runFor(1000 / 30); await shot("turn"); }
  await page.mouse.up();
  await step(45, "coast");                                   // it keeps turning and settles
  await step(30, "night");
  // back to now
  const back = page.locator('[data-dc="back"]');
  if (await back.isVisible().catch(() => false)) { await back.click({ noWaitAfter: true }).catch(() => {}); await step(45, "back"); }
  // tap: unroll into the timeline
  await page.locator('[data-dc="hit"]').click({ noWaitAfter: true }).catch((e) => console.log("hit", e.message));
  await step(50, "open");
  console.log("frames", n);
  await browser.close();
})();
