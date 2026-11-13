// Shared filming helpers for "What's new": the real app at 432 x 768 at 2.5x (1080 x 1920), the film's clock, every
// animation held and stepped 1/30 s per frame (CSS animations and transitions, the app's own Web Animations, and
// everything on timers or requestAnimationFrame through Playwright's clock), a finger log for the compositor.
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const STEPPER = () => {
  const own = (an) => { if (an.__lf) return; an.__lf = true; try { an.pause(); } catch {} };
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (...args) { const an = orig.apply(this, args); own(an); return an; };
  const grab = () => { for (const an of document.getAnimations()) own(an); };
  addEventListener("animationstart", grab, true); addEventListener("transitionrun", grab, true);
  window.__step = (ms) => {
    for (const an of document.getAnimations()) {
      own(an);
      const end = an.effect ? an.effect.getComputedTiming().endTime : Infinity;
      const t = (an.currentTime || 0) + ms;
      if (end !== Infinity && t >= end) {
        if (!an.__fin) { an.__fin = true; try { an.finish(); } catch {} try { an.onfinish && an.onfinish.call(an, new Event("finish")); } catch {} }
      } else an.currentTime = t;
    }
  };
};
async function film(name, at, { scale = 2.5 } = {}) {
  const out = path.join(__dirname, "cap", name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: scale, storageState: process.env.STATE || path.join(__dirname, "state2.json"), timezoneId: "America/New_York" });
  await ctx.addInitScript(STEPPER);
  // a returning person's phone has their first name and zone saved by the app (the opening screen reads them)
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("lf_first_name")) localStorage.setItem("lf_first_name", "Alex"); if (!localStorage.getItem("lf_tz")) localStorage.setItem("lf_tz", "America/New_York"); } catch {} });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(at) });
  const log = []; const anchors = {}; let n = 0; const S = { finger: null };
  const tidy = () => page.evaluate(() => {
    for (const el of document.querySelectorAll("nextjs-portal")) el.remove();
    for (const el of [...document.querySelectorAll("button, a, div, span")].filter((e) => e.children.length < 4 && /^\s*Sample data\s*$/.test(e.textContent))) { let c = el; while (c.parentElement && c.parentElement.textContent.trim() === "Sample data") c = c.parentElement; c.style.visibility = "hidden"; }
  }).catch(() => {});
  const shot = async (tag) => { n++; if (S.png) await page.screenshot({ path: path.join(out, `w${String(n).padStart(4, "0")}.png`), clip: S.png, omitBackground: true }); else await page.screenshot({ path: path.join(out, `${String(n).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 }); log.push({ tag, finger: S.finger }); };
  const frame = async (tag) => { await page.clock.runFor(1000 / 30); await page.evaluate((ms) => window.__step && window.__step(ms), 1000 / 30).catch(() => {}); await shot(tag); };
  const hold = async (tag, k) => { for (let i = 0; i < k; i++) await frame(tag); };
  const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }).catch(() => null);
  const ease = (k) => k * k * (3 - 2 * k);
  // a tap: the finger lands (one frame), the click, then the finger lifts
  const tap = async (tag, loc, settle = 0) => {
    const b = await loc.boundingBox(); S.finger = [b.x + b.width / 2, b.y + b.height / 2]; await shot(tag);
    await loc.click({ noWaitAfter: true }); S.finger = null; if (settle) await hold(tag + "-after", settle);
  };
  const drag = async (tag, x0, y0, x1, y1, steps, holdK = 0) => {
    S.finger = [x0, y0]; await page.mouse.move(x0, y0); await page.mouse.down(); await frame(tag);
    for (let i = 1; i <= steps; i++) { const k = ease(i / steps); const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k; S.finger = [x, y]; await page.mouse.move(x, y); await frame(tag); }
    for (let i = 0; i < holdK; i++) await frame(tag);
    await page.mouse.up(); S.finger = null;
  };
  // off camera: let the clock and the animations run until something is on screen
  const until = async (loc, maxMs = 30000) => { for (let t = 0; t < maxMs; t += 250) { if (await loc.isVisible().catch(() => false)) return true; await page.clock.runFor(250); await page.evaluate(() => window.__step && window.__step(250)).catch(() => {}); } return false; };
  const done = async () => { fs.writeFileSync(path.join(out, "log.json"), JSON.stringify({ anchors, frames: log })); console.log(name, "frames", n); await browser.close(); };
  return { page, out, log, anchors, S, tidy, shot, frame, hold, rect, tap, drag, until, done, count: () => n };
}
module.exports = { film };
