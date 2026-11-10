const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const R = __dirname;
(async () => {
  const which = process.argv[2] || "all";
  const browser = await chromium.launch();
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, storageState: path.join(R, "probe/state.json") }); return [ctx, await ctx.newPage()]; };
  const hideDev = (page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  if (which === "all" || which === "settings") {
    const out = path.join(R, "settings"); fs.mkdirSync(out, { recursive: true });
    const [ctx, page] = await mk();
    await page.clock.install({ time: new Date("2026-11-09T12:58:00Z") });
    await page.goto("http://localhost:3100/settings/jarvis", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
    await hideDev(page);
    const sec = page.locator('section[aria-labelledby="companion-h"]');
    await sec.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -80));
    await page.clock.pauseAt(new Date("2026-11-09T13:00:00Z")); await page.clock.runFor(1500);
    const bb = await sec.boundingBox();
    const clip = { x: bb.x, y: bb.y, width: bb.width, height: 432 };
    let n = 0; const shot = async () => { n++; await page.screenshot({ path: path.join(out, `${String(n).padStart(4, "0")}.jpg`), clip, type: "jpeg", quality: 93 }); };
    const tick = async (k) => { for (let i = 0; i < k; i++) { await page.clock.runFor(1000 / 30); await shot(); } };
    await tick(24);
    const tile = page.getByRole("radio", { name: /Changes with the sky/ });
    await tile.click({ noWaitAfter: true });
    for (let i = 0; i < 60; i++) { await page.clock.runFor(1000 / 30); await page.waitForTimeout(25); await shot(); }
    console.log("settings frames", n, "checked", await tile.getAttribute("aria-checked"));
    await ctx.close();
  }
  if (which === "all" || which === "today") {
    const TIMES = [["dawn", "2026-11-09T11:20:00Z"], ["ray", "2026-11-09T13:00:00Z"], ["noon", "2026-11-09T17:30:00Z"], ["goldie", "2026-11-09T21:00:00Z"], ["dusk", "2026-11-09T22:10:00Z"], ["star", "2026-11-10T04:00:00Z"]];
    for (const [key, iso] of TIMES) {
      const out = path.join(R, "today_" + key); fs.mkdirSync(out, { recursive: true });
      const [ctx, page] = await mk();
      const t = new Date(iso).getTime();
      await page.clock.install({ time: new Date(t - 120000) });
      await page.goto("http://localhost:3100/?splash=0", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
      await hideDev(page);
      await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
      await page.clock.pauseAt(new Date(t)); await page.clock.runFor(2500);
      const dc = await page.locator('[data-testid="day-clock"]').boundingBox();
      const clip = { x: 0, y: dc.y, width: 430, height: 504 };
      for (let i = 1; i <= 54; i++) { await page.clock.runFor(1000 / 30); await page.screenshot({ path: path.join(out, `${String(i).padStart(4, "0")}.jpg`), clip, type: "jpeg", quality: 93 }); }
      const who = await page.locator('[data-testid="day-clock"]').getAttribute("data-skyling-now").catch(() => null);
      console.log(key, iso, "skyling-now", who);
      await ctx.close();
    }
  }
  await browser.close();
})();
