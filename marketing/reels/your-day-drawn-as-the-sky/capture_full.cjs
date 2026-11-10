// Full-screen app footage (432 x 768 at 2.5x = 1080 x 1920, no phone): Today on the film day at 2:30 PM New York
// (explain, turn, back, open, slide back, glide ahead), and Settings › Your skyling with the tap on "Changes with the sky".
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const which = process.argv[2] || "today";
const ease = (k) => k * k * (3 - 2 * k);
const tidy = (page) => page.evaluate(() => {
  for (const el of document.querySelectorAll("nextjs-portal")) el.remove();
  for (const el of [...document.querySelectorAll("button, a, div, span")].filter((e) => e.children.length < 4 && /^\s*Sample data\s*$/.test(e.textContent))) { let c = el; while (c.parentElement && c.parentElement.textContent.trim() === "Sample data") c = c.parentElement; c.style.visibility = "hidden"; }
});
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, storageState: path.join(__dirname, "../skyreel/probe/state.json") });
  const page = await ctx.newPage();
  let n = 0; const log = []; let finger = null, out;
  let shot = async (tag) => { n++; await page.screenshot({ path: path.join(out, `${String(n).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 }); log.push({ tag, finger }); };
  const tick = async (tag, k) => { for (let i = 0; i < k; i++) { await page.clock.runFor(1000 / 30); await shot(tag); } };
  const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }).catch(() => null);
  if (which === "today") {
    out = path.join(__dirname, "full"); fs.mkdirSync(out, { recursive: true });
    await page.clock.install({ time: new Date("2026-11-10T19:28:00Z") });
    await page.goto("http://localhost:3100/?splash=0", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
    await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
    await tidy(page);
    await page.clock.pauseAt(new Date("2026-11-10T19:30:00Z")); await page.clock.runFor(2500); await tidy(page);
    const anchors = {
      who: await rect(page.locator('[data-dc="who"]')), sun: await rect(page.getByText(/Sun sets in/).first()), next: await rect(page.locator(".dc-w-now").first()),
      clash: await page.getByText("overlaps").first().evaluate((el) => { while (el && el.getBoundingClientRect().height < 90) el = el.parentElement; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }).catch(() => null),
      nav: await rect(page.locator("nav").last()),
    };
    await tick("idle", 240);
    const dc = await page.locator('[data-testid="day-clock"]').boundingBox();
    const drag = async (tag, x0, y, dx, steps, hold) => {
      finger = [x0, y]; await page.mouse.move(x0, y); await page.mouse.down(); await page.clock.runFor(1000 / 30); await shot(tag);
      for (let i = 1; i <= steps; i++) { const x = x0 + dx * ease(i / steps); finger = [x, y]; await page.mouse.move(x, y); await page.clock.runFor(1000 / 30); await shot(tag); }
      for (let i = 0; i < hold; i++) { await page.clock.runFor(1000 / 30); await shot(tag); }
      await page.mouse.up(); finger = null;
    };
    await drag("turn", 330, dc.y + 250, -250, 50, 24);
    await tick("turned", 30);
    const backBtn = page.locator('[data-dc="back"]');
    if (await backBtn.isVisible().catch(() => false)) { const bb = await backBtn.boundingBox(); finger = [bb.x + bb.width / 2, bb.y + bb.height / 2]; await shot("tapback"); await backBtn.click({ noWaitAfter: true }).catch(() => {}); finger = null; }
    await tick("back", 36);
    { const bb = await page.locator('[data-dc="hit"]').boundingBox(); finger = [216, dc.y + 200]; await shot("tap"); await page.locator('[data-dc="hit"]').click({ noWaitAfter: true, position: { x: 216, y: dc.y + 200 - bb.y } }); finger = null; }
    await tick("open", 50);
    const Y = dc.y + 200;
    finger = [60, Y]; await page.mouse.move(60, Y); await page.mouse.down();
    for (let i = 1; i <= 40; i++) { const x = 60 + 270 * ease(i / 40); finger = [x, Y]; await page.mouse.move(x, Y); await page.clock.runFor(1000 / 30); await shot("past"); }
    for (let i = 0; i < 45; i++) { await page.clock.runFor(1000 / 30); await shot("past"); }
    for (let i = 1; i <= 30; i++) { const x = 330 - i * 13; finger = [x, Y]; await page.mouse.move(x, Y); await page.clock.runFor(1000 / 30); await shot("fwd"); }
    await page.mouse.up(); finger = null; await tick("fling", 24);
    finger = [415, Y + 2]; await page.mouse.move(415, Y + 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { const x = 415 - i * 45; finger = [x, Y + 2]; await page.mouse.move(x, Y + 2); await page.clock.runFor(1000 / 30); await shot("flick"); }
    await page.mouse.up(); finger = null; await tick("next", 60);
    fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ anchors, frames: log }));
  } else if (which === "done") {
    // Ticking a to-do off on the opened day: slide ahead to tonight's Groceries, open its card, tap Done (the star, the hop).
    // The page's own Web Animations (the star, the sparks, the hop, the card) are paused and stepped 1/30 s per frame,
    // like the fake clock steps everything else, so the film shows them at their real speed.
    out = path.join(__dirname, "full_done"); fs.mkdirSync(out, { recursive: true });
    await page.clock.install({ time: new Date("2026-11-10T19:28:00Z") });
    await page.goto("http://localhost:3100/?splash=0", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
    await page.waitForSelector('[data-testid="day-clock"]', { timeout: 120000 });
    await tidy(page);
    await page.clock.pauseAt(new Date("2026-11-10T19:30:00Z")); await page.clock.runFor(2500); await tidy(page);
    await page.evaluate(() => {
      window.__step = (ms) => {
        for (const a of document.getAnimations()) {
          if (!a.__lf) { a.__lf = true; try { a.pause(); } catch {} }
          const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
          const t = (a.currentTime || 0) + ms;
          if (end !== Infinity && t >= end) { if (!a.__fin) { a.__fin = true; try { a.finish(); } catch {} try { a.onfinish && a.onfinish.call(a, new Event("finish")); } catch {} } } else a.currentTime = t;
        }
      };
    });
    const step = async (tag, k) => { for (let i = 0; i < k; i++) { await page.clock.runFor(1000 / 30); await page.evaluate((ms) => window.__step(ms), 1000 / 30); await shot(tag); } };
    if (process.env.SLLOG) { const base = shot; const sl = () => page.evaluate(() => { const r = document.querySelector('[data-testid="day-clock"]'); const w = r.querySelector("[data-dc=trackWrap]"); const nb = r.querySelector(".dc-now"); const tr = r.querySelector("[data-dc=track]"); return [w ? Math.round(w.scrollLeft) : null, nb ? Math.round(nb.getBoundingClientRect().x) : null, tr ? Math.round(tr.scrollWidth) : null, nb ? nb.style.left : null]; }); shot = async (tag) => { await base(tag); log[log.length - 1].sl = await sl(); }; }
    const dc = await page.locator('[data-testid="day-clock"]').boundingBox();
    { const bb = await page.locator('[data-dc="hit"]').boundingBox(); finger = [216, dc.y + 200]; await shot("tap"); await page.locator('[data-dc="hit"]').click({ noWaitAfter: true, position: { x: 216, y: dc.y + 200 - bb.y } }); finger = null; }
    await step("open", 40);
    const Y = dc.y + 200;
    finger = [330, Y]; await page.mouse.move(330, Y); await page.mouse.down();
    for (let i = 1; i <= 30; i++) { const x = 330 - 150 * ease(i / 30); finger = [x, Y]; await page.mouse.move(x, Y); await page.clock.runFor(1000 / 30); await page.evaluate((ms) => window.__step(ms), 1000 / 30); await shot("slide"); }
    for (let i = 0; i < 10; i++) { await page.clock.runFor(1000 / 30); await page.evaluate((ms) => window.__step(ms), 1000 / 30); await shot("slide"); }
    await page.mouse.up(); finger = null; await step("slid", 12);
    const groc = page.getByRole("button", { name: /^Groceries due, Tue/ });
    const gb = await groc.boundingBox(); finger = [gb.x + gb.width / 2, gb.y + gb.height / 2]; await shot("tapgroc");
    await groc.click({ noWaitAfter: true }); finger = null;
    await step("card", 40);
    const done = page.locator(".dc-d-done"); const db = await done.boundingBox();
    const anchors = { done: db && [db.x, db.y, db.width, db.height], card: await rect(page.locator(".dc-d-done").locator("xpath=ancestor::*[contains(@class,'dc-d-body')]/..")), who: await rect(page.locator(".dc-now-who").first()) };
    finger = [db.x + db.width / 2, db.y + db.height / 2]; await shot("tapdone");
    await done.click({ noWaitAfter: true }); finger = null;
    await step("cheer", 75);
    fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ anchors, frames: log }));
  } else {
    out = path.join(__dirname, "full_settings"); fs.mkdirSync(out, { recursive: true });
    await page.clock.install({ time: new Date("2026-11-10T19:28:00Z") });
    await page.goto("http://localhost:3100/settings/jarvis", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
    const sec = page.locator('section[aria-labelledby="companion-h"]');
    await sec.evaluate((el) => el.scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -70));
    await tidy(page);
    await page.clock.pauseAt(new Date("2026-11-10T19:30:00Z")); await page.clock.runFor(1500); await tidy(page);
    const tile = page.getByRole("radio", { name: /Changes with the sky/ });
    const anchors = { grid: await rect(page.getByRole("radiogroup").first()), sky: await rect(tile), header: await rect(sec) };
    await tick("idle", 75);
    const tb = await tile.boundingBox(); finger = [tb.x + tb.width / 2, tb.y + tb.height / 2]; await shot("tap");
    await tile.click({ noWaitAfter: true }); finger = null;
    for (let i = 0; i < 75; i++) { await page.clock.runFor(1000 / 30); await page.waitForTimeout(20); await shot("picked"); }
    fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ anchors, frames: log }));
    console.log("checked", await tile.getAttribute("aria-checked"));
  }
  console.log(which, "frames", n);
  await browser.close();
})();
