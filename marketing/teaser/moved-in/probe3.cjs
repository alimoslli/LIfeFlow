const { chromium } = require("playwright"); const path = require("path");
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, storageState: path.join(__dirname, "probe/state.json") });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-11-09T19:29:00Z") });
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
  await page.clock.pauseAt(new Date("2026-11-09T19:30:00Z")); await page.clock.runFor(2000);
  await page.locator('[data-dc="hit"]').click({ noWaitAfter: true });
  for (let i = 0; i < 60; i++) await page.clock.runFor(33);
  // drag the line to the right (earlier today)
  await page.mouse.move(215, 260); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(215 + i * 16, 260); await page.clock.runFor(33); }
  await page.mouse.up(); for (let i = 0; i < 45; i++) await page.clock.runFor(33);
  await page.screenshot({ path: out + "/p_back.png" });
  const btn = page.locator('[data-dc="track"] button[aria-label^="Coffee with Maya"]');
  const bb = await btn.boundingBox(); console.log("coffee", JSON.stringify(bb));
  await btn.click({ noWaitAfter: true }); for (let i = 0; i < 30; i++) await page.clock.runFor(33);
  await page.screenshot({ path: out + "/p_detail.png" });
  const det = await page.locator('[data-dc="detail"]').boundingBox(); console.log("detail", JSON.stringify(det));
  console.log((await page.locator('[data-dc="detail"]').innerText()).replace(/\n/g, " | ").slice(0, 200));
  await browser.close();
})();
