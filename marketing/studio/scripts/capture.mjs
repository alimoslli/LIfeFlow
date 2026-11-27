// Film the real LifeFlow app (the synced checkout, running locally on the studio's demo database) for use in videos.
//   npm run capture                       # every shot in demo/shots.json
//   npm run capture -- nico-mission/today # one shot
// Needs the app running:  cd .app && PORT=3100 npm start   (after npm run build; the studio's .env points at budgetflow_studio)
// Each shot plays on a frozen clock stepped one frame at a time (Playwright's clock), so JS-driven motion repeats exactly.
// Output: public/captures/<profile>/<shot>.mp4 (+ .png poster, .json with the app commit and clock).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { STUDIO } from "../webpack-override.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.APP_URL ?? "http://localhost:3100";
const FPS = 30;
const W = 390, H = 844, DPR = Number(process.env.CAPTURE_DPR ?? 3);
const cfg = JSON.parse(readFileSync(join(STUDIO, "demo/shots.json"), "utf8"));
const app = JSON.parse(readFileSync(join(STUDIO, ".app-version.json"), "utf8"));
const only = process.argv[2];
const shots = cfg.shots.filter((s) => !only || `${s.profile}/${s.id}` === only);
if (!shots.length) throw new Error(`No shot ${only}`);

const dayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function zonedTime(tz, hhmm) {
  // the instant when it is hh:mm today in tz
  const naive = new Date(`${dayIn(tz)}T${hhmm}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(naive).map((x) => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(naive.getTime() + (naive.getTime() - shown));
}

const browser = await chromium.launch();
const logins = {};
for (const shot of shots) {
  const prof = cfg.profiles[shot.profile];
  if (!logins[shot.profile]) {
    const c = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: prof.tz });
    const p = await c.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill("input[type=email], input[name=email]", prof.email);
    await p.fill("input[type=password]", prof.password);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click("button[type=submit]")]);
    logins[shot.profile] = await c.storageState();
    await c.close();
  }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, timezoneId: prof.tz, isMobile: true, hasTouch: true, storageState: logins[shot.profile], reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const at = zonedTime(prof.tz, prof.clock);
  await page.clock.install({ time: at });
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  await page.clock.runFor(1500);
  // the "Sample data" tag is for people trying the demo; it has its own hide button (the choice is kept on the device)
  await page.locator('[aria-label="Hide the sample data label"]').first().click({ timeout: 2000 }).catch(() => {});
  await page.clock.runFor(400);
  const dir = join(STUDIO, "cache/capture", shot.profile, shot.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const n = Math.round(shot.seconds * FPS);
  const acts = (shot.actions ?? []).map((a) => ({ ...a, f: Math.round(a.at * FPS) }));
  let drag = null;
  let scroll = null;
  for (let f = 0; f < n; f++) {
    for (const a of acts.filter((a) => a.f === f)) {
      if (a.tap) await page.locator(a.tap).first().click({ force: true, timeout: 5000 }).catch((e) => console.warn("tap", a.tap, e.message));
      if (a.goto) await page.goto(`${BASE}${a.goto}`);
      if (a.drag) {
        const [x0, x1, y, secs] = a.drag;
        drag = { x0, x1, y, f0: f, n: Math.max(2, Math.round(secs * FPS)) };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
      }
      if (a.scroll) scroll = { dy: a.scroll[0], f0: f, n: Math.max(2, Math.round(a.scroll[1] * FPS)), done: 0 };
    }
    if (drag) {
      const k = Math.min(1, (f - drag.f0) / drag.n);
      const e = k * k * (3 - 2 * k);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: drag.x0 + (drag.x1 - drag.x0) * e, y: drag.y }] });
      if (k >= 1) (await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }), (drag = null));
    }
    if (scroll) {
      const k = Math.min(1, (f - scroll.f0) / scroll.n);
      const e = k * k * (3 - 2 * k);
      const to = scroll.dy * e;
      await page.mouse.wheel(0, to - scroll.done);
      scroll.done = to;
      if (k >= 1) scroll = null;
    }
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: join(dir, `${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 94, animations: "allow" });
  }
  await ctx.close();
  const out = join(STUDIO, "public/captures", shot.profile);
  mkdirSync(out, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "%04d.jpg"), "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, `${shot.id}.mp4`)]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(dir, "0000.jpg"), join(out, `${shot.id}.png`)]);
  writeFileSync(join(out, `${shot.id}.json`), JSON.stringify({ shot, app: app.commit, appDate: app.date, clock: `${dayIn(prof.tz)} ${prof.clock} ${prof.tz}`, frames: n, size: [W * DPR, H * DPR], capturedAt: new Date().toISOString() }, null, 1));
  rmSync(dir, { recursive: true, force: true });
  console.log(`captured ${shot.profile}/${shot.id}: ${n} frames`);
}
await browser.close();
