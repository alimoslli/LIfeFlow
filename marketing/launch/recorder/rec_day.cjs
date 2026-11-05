// Records the real "Your day, connected" onboarding in slow motion (GSAP + CSS at SLOW speed), so every frame is captured.
// Writes frames/NNNNN.jpg + log.json (frame content times, taps, markers).
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:3000";
const SLOW = 0.12;
const DIR = __dirname + "/frames"; // scratch output, not committed
const SEED = 1057; // previewDay seed: study block, charged twice, shift clash
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

  mark("hello");
  await wait(1.0);
  await tapAt(p.getByRole("button", { name: "Let's go" }), 1.0);
  mark("week");
  await wait(0.2);
  await tapAt(p.getByRole("radio", { name: /Both/ }), 0.6);
  await tapAt(p.getByRole("button", { name: "Continue" }), 1.0);
  mark("details");
  await tapAt(p.getByRole("textbox", { name: "A class you're taking" }), 0.2);
  await type("BIO 101");
  await wait(0.3);
  await tapAt(p.getByRole("textbox", { name: "Where you work" }), 0.2);
  await type("Corner Café");
  await wait(0.5);
  await tapAt(p.getByRole("button", { name: "Continue" }), 1.0);
  mark("yours");
  await tapAt(p.getByRole("textbox", { name: "Assistant name" }), 0.2);
  await type("Remy");
  await wait(0.5);
  await tapAt(p.getByRole("radio", { name: /Coach/ }), 1.4);
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
  await wait(2.2);
  // a slow scroll so all three cards and their buttons sit in view
  const y0 = await p.evaluate(() => window.scrollY);
  const maxY = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const dy = Math.min(maxY - y0, 260);
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await p.evaluate((y) => window.scrollTo(0, y), y0 + dy * e);
    await wait(1.0 / steps);
  }
  mark("scrolled");
  await wait(0.8);
  await tapAt(p.getByRole("button", { name: "Show me", exact: true }), 2.0);
  mark("end");
  rec = false;
  await loop;
  log.forcedUsed = await p.evaluate(() => window.__forcedUsed || 0);
  log.titles = await p.locator("article h2").allTextContents();
  log.today = await p.evaluate(() => new Date().toString());
  fs.writeFileSync(__dirname + "/log.json", JSON.stringify(log));
  console.log("done", log.frames.length, "frames", JSON.stringify(log.titles), "forced", log.forcedUsed);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
