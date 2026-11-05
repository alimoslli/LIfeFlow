// Records the real "Your day, connected" onboarding in slow motion (GSAP + CSS at SLOW speed), so every frame is captured.
// Writes frames/NNNNN.jpg + log.json (frame content times, taps, markers).
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:3000";
const SLOW = 0.12;
const DIR = __dirname + "/frames_try";
const SEED = 29259; // student: study block, Netflix charged twice, quiz; next day: syllabus, trial, gym
const TARGET = new Date("2026-11-04T13:06:00-05:00").getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `(() => {
  // A clock that can run slow: GSAP reads Date.now, so slowing it slows every GSAP animation.
  const RD = Date, rnow = RD.now.bind(RD);
  let r0 = rnow(), v0 = ${TARGET}, rate = 1;
  const vnow = () => v0 + (rnow() - r0) * rate;
  window.__setRate = (r) => { v0 = vnow(); r0 = rnow(); rate = r; };
  class D extends RD { constructor(...a) { if (a.length === 0) super(vnow()); else super(...a); } static now() { return vnow(); } }
  D.parse = RD.parse; D.UTC = RD.UTC;
  window.Date = D;
  const orig = Math.random.bind(Math);
  Math.random = function () { if (window.__forceRand != null) { const v = window.__forceRand; window.__forceRand = null; window.__forcedUsed = (window.__forcedUsed || 0) + 1; return v; } return orig(); };
  const NAMES = ['Jarvis', 'Nova', 'Sage', 'Atlas', 'Max'];
  new MutationObserver(() => {
    for (const b of document.querySelectorAll('button')) { const p = b.parentElement; if (p && NAMES.includes((b.textContent || '').trim()) && p.style.display !== 'none') p.style.display = 'none'; }
    const inp = document.querySelector('input[aria-label="Assistant name"]');
    if (inp && !inp.__cleared && inp.value === 'Jarvis') { inp.__cleared = true; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  }).observe(document, { childList: true, subtree: true });
})();`;

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    timezoneId: "America/New_York",
    locale: "en-US",
    reducedMotion: "no-preference",
  });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  // sign up at normal speed (not filmed)
  const email = `maya.brooks.${Date.now()}@example.edu`;
  await p.goto(BASE + "/signup");
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.fill("input[name=name]", "Maya Brooks");
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", "Maple-River-4821-Quiet");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL(/welcome/, { timeout: 30000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  await sleep(2500);

  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: SLOW });
  await p.evaluate((s) => window.__setRate(s), SLOW);
  const log = { slow: SLOW, frames: [], taps: [], marks: {} };
  const t0 = performance.now();
  const now = () => ((performance.now() - t0) / 1000) * SLOW;
  const wait = (c) => sleep((c / SLOW) * 1000);
  let rec = true;
  const loop = (async () => {
    while (rec) {
      const a = performance.now();
      const buf = await p.screenshot({ type: "jpeg", quality: 90, scale: "device" });
      const bt = performance.now();
      const f = String(log.frames.length).padStart(5, "0") + ".jpg";
      fs.writeFileSync(`${DIR}/${f}`, buf);
      log.frames.push([f, (((a + bt) / 2 - t0) / 1000) * SLOW]);
      const gap = (1 / 60 / SLOW) * 1000 - (performance.now() - a);
      if (gap > 0) await sleep(gap);
    }
  })();
  const mark = (k) => {
    log.marks[k] = now();
    console.log("mark", k, now().toFixed(2), "frames", log.frames.length);
  };
  const tapAt = async (loc, after) => {
    const bb = await loc.boundingBox();
    const x = bb.x + bb.width / 2,
      y = bb.y + bb.height / 2;
    log.taps.push({ t: now(), x, y });
    await wait(0.12);
    await p.touchscreen.tap(x, y);
    await wait(after);
  };
  const type = async (text) => {
    for (const ch of text) {
      await p.keyboard.type(ch);
      await wait(0.075);
    }
  };

  const scrollBy = async (dy, secs) => {
    const y0 = await p.evaluate(() => window.scrollY);
    const steps = Math.max(1, Math.round(secs * 30));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await p.evaluate((y) => window.scrollTo(0, y), y0 + dy * e);
      await wait(secs / steps);
    }
  };
  const cardRect = async (i, key) => {
    log.cards = log.cards || {};
    log.cards[key] = {
      t: now(),
      r: await p
        .locator("article")
        .nth(i)
        .evaluate((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
    };
  };
  const bringIntoView = async (loc, bottomPad) => {
    const r = await loc.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return [r.top, r.bottom];
    });
    const over = r[1] - (844 - bottomPad);
    if (over > 0) await scrollBy(over, 0.7);
  };

  mark("hello");
  await wait(0.8);
  await tapAt(p.getByRole("button", { name: "Let's go" }), 0.9);
  mark("week");
  await wait(0.2);
  await tapAt(p.getByRole("radio", { name: /^Classes/ }), 0.6);
  await tapAt(p.getByRole("button", { name: "Continue" }), 0.9);
  mark("details");
  await tapAt(p.getByRole("textbox", { name: "A class you're taking" }), 0.2);
  await type("PSY 101");
  await wait(0.5);
  await tapAt(p.getByRole("button", { name: "Continue" }), 0.9);
  mark("yours");
  await tapAt(p.getByRole("textbox", { name: "Assistant name" }), 0.2);
  await type("Remy");
  await wait(0.6);
  const go = p.getByRole("button", { name: "Show me my day" });
  const bb = await go.boundingBox();
  log.taps.push({ t: now(), x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  await wait(0.12);
  await p.evaluate(
    (v) => {
      window.__forceRand = v;
    },
    (SEED + 0.5) / 1e9,
  );
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  mark("day");
  await p.getByText("Here's what I'd do", { exact: false }).waitFor({ timeout: 300000 });
  mark("result");
  await wait(2.0);
  mark("tap1");
  await tapAt(p.getByRole("button", { name: "Block it", exact: true }), 0.6);
  await cardRect(0, "block");
  await wait(1.2);
  mark("tap2");
  await tapAt(p.getByRole("button", { name: "Show me", exact: true }), 0.6);
  await cardRect(1, "show");
  await wait(1.2);
  mark("scroll3");
  const quiz = p.getByRole("button", { name: "Quiz me", exact: true });
  await bringIntoView(p.locator("article").nth(2), 150);
  await wait(0.4);
  mark("tap3");
  await tapAt(quiz, 0.6);
  await cardRect(2, "quiz");
  await wait(1.2);
  mark("scroll4");
  const again = p.getByRole("button", { name: /Show me another day/ });
  await bringIntoView(again, 170);
  await wait(0.4);
  mark("again");
  await tapAt(again, 0.05);
  await p.evaluate(() => window.scrollTo(0, 0));
  log.titles1 = ["Study", "Netflix", "review"];
  await p.getByText("Here's what I'd do", { exact: false }).waitFor({ timeout: 300000 });
  mark("result2");
  await wait(2.6);
  await scrollBy(220, 1.0);
  await wait(1.0);
  mark("end");
  rec = false;
  await loop;
  log.forcedUsed = await p.evaluate(() => window.__forcedUsed || 0);
  log.titles = await p.locator("article h2").allTextContents();
  log.today = await p.evaluate(() => new Date().toString());
  fs.writeFileSync(__dirname + "/log_try.json", JSON.stringify(log));
  console.log("done", log.frames.length, "frames", JSON.stringify(log.titles), "forced", log.forcedUsed);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
