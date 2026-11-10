/**
 * The brand sheet for the owner: docs/design/brand/morning-mark.png. The mark at 16, 32, 64 and 180 px on light and
 * dark, the app icons, the top bar with the mark, and three frames of the opening splash, all drawn from the same
 * sources the app uses (morning-mark.ts, the splash CSS in globals.css and the generated icon PNGs).
 *
 *   npx tsx scripts/brand-icons.ts && npx tsx scripts/brand-sheet.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { morningMarkSvg } from "../src/components/brand/morning-mark";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs/design/brand/morning-mark.png");
const WIDTH = 1360;

/** The splash rules, copied from globals.css so the frames are the real thing. */
async function splashCss(): Promise<string> {
  const css = await readFile(path.join(ROOT, "src/app/globals.css"), "utf8");
  const start = css.indexOf("/* Opening splash (see components/motion/splash.tsx)");
  const end = css.indexOf("@keyframes lf-splash-failsafe");
  if (start < 0 || end < 0) throw new Error("splash CSS not found in globals.css");
  return css.slice(start, end);
}

const png = async (file: string) => `data:image/png;base64,${(await readFile(path.join(ROOT, file))).toString("base64")}`;

function marks(bg: string, fg: string, label: string): string {
  const sizes = [16, 32, 64, 180];
  return `<div class="panel" style="background:${bg};color:${fg}">
    <div class="row">${sizes.map((s, i) => `<figure>${morningMarkSvg(s, `${label}${i}`)}<figcaption>${s} px</figcaption></figure>`).join("")}</div>
  </div>`;
}

function splashFrame(ms: number, caption: string): string {
  return `<figure class="phone" style="--t:${ms}">
    <div class="lf-splash-layer"><div class="lf-splash-inner">
      <div class="lf-splash-sky"><span class="lf-splash-glow"></span><span class="lf-splash-sun"></span></div>
      <span class="lf-splash-horizon"></span>
      <div class="lf-splash-ground"><p class="lf-greet lf-greet-1 g1"></p><p class="lf-greet lf-greet-2 g2"></p><span class="lf-greet-line gl"></span></div>
    </div></div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}

async function page(): Promise<string> {
  const [icon512, maskable, apple, social] = await Promise.all([
    png("public/brand/lifeflow-mark-512.png"),
    png("public/brand/lifeflow-maskable-512.png"),
    png("public/brand/lifeflow-apple-touch.png"),
    png("public/brand/lifeflow-social.png"),
  ]);
  return `<!doctype html><html class="lf-splash" style="--lf-greet:'Good morning';--lf-name:'Alex'"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Inter:wght@400;500;600&display=swap">
<style>
  :root { --hero-text: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; width: ${WIDTH}px; background: #f6f8fb; color: #0f1a2a; font: 14px/1.4 Inter, system-ui, sans-serif; padding: 48px 56px 56px; }
  h1 { font: 500 34px/1.1 Fraunces, Georgia, serif; letter-spacing: -0.02em; margin: 0 0 6px; }
  .sub { color: #5f6b7d; margin: 0 0 36px; font-size: 15px; }
  h2 { font: 600 12px/1 Inter, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #5f6b7d; margin: 36px 0 14px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .panel { border-radius: 20px; padding: 28px 32px; box-shadow: 0 0 0 1px rgb(15 26 42 / 0.06); }
  .row { display: flex; align-items: flex-end; gap: 36px; }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  figcaption { font-size: 12px; opacity: 0.7; }
  .icons { display: flex; align-items: flex-end; gap: 36px; }
  .icons img, .icons svg { display: block; box-shadow: 0 10px 30px -12px rgb(15 26 42 / 0.35); }
  .tile { border-radius: 22%; }
  .circle { border-radius: 50%; }
  .bars { display: grid; grid-template-columns: 390px 390px 1fr; gap: 20px; align-items: start; }
  .bar { border-radius: 20px; padding: 14px 16px 0; height: 128px; overflow: hidden; box-shadow: 0 0 0 1px rgb(15 26 42 / 0.06); }
  .bar.light { background: #f6f8fb; color: #0f1a2a; }
  .bar.dark { background: #07101f; color: #e9eef6; }
  .topbar { display: flex; align-items: center; height: 44px; gap: 10px; }
  .topbar .mark { width: 28px; height: 28px; }
  .topbar .title { flex: 1; text-align: center; font-weight: 600; font-size: 16px; }
  .topbar .gear { width: 22px; height: 22px; border-radius: 50%; border: 2px solid currentColor; opacity: 0.55; }
  .hello { font: 500 28px/1.1 Fraunces, Georgia, serif; letter-spacing: -0.02em; margin: 16px 0 0; }
  .lockup { display: flex; align-items: center; gap: 10px; padding: 24px 28px; }
  .lockup .mark { width: 32px; height: 32px; }
  .lockup .word { font: 500 22px/1 Fraunces, Georgia, serif; letter-spacing: -0.035em; }
  .lockup.dark { background: #07101f; color: #fff; }
  .lockup.light { background: #fff; color: #0f1a2a; }
  .splashes { display: flex; gap: 20px; }
  .phone { width: 300px; }
  html.lf-splash .phone .lf-splash-layer { position: relative; width: 300px; height: 540px; border-radius: 28px; overflow: hidden; box-shadow: 0 0 0 1px rgb(15 26 42 / 0.08); inset: auto; z-index: auto; animation: none; }
  .phone .lf-splash-inner { --lf-sun: 150px; }
  .g1 { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.8; margin: 0; }
  .g2 { font: 500 34px/1 Fraunces, Georgia, serif; letter-spacing: -0.02em; margin: 8px 0 0; }
  .gl { margin-top: 18px; height: 1px; width: 56px; background: rgb(255 255 255 / 0.5); }
  .social { width: 420px; border-radius: 14px; display: block; box-shadow: 0 10px 30px -12px rgb(15 26 42 / 0.35); }
  ${await splashCss()}
</style></head><body>
<h1>LifeFlow, the morning</h1>
<p class="sub">The sun rising on the morning horizon, with its small face. One vector mark, the real sky's colours, never purple.</p>

<h2>The mark on light and dark</h2>
<div class="two">${marks("#ffffff", "#0f1a2a", "l")}${marks("#07101f", "#e9eef6", "d")}</div>

<h2>App icons</h2>
<div class="panel" style="background:#fff">
  <div class="icons">
    <figure><img class="tile" src="${icon512}" width="180" height="180"><figcaption>Home screen, 180 px</figcaption></figure>
    <figure><img class="tile" src="${icon512}" width="64" height="64"><figcaption>64 px</figcaption></figure>
    <figure><img class="tile" src="${icon512}" width="32" height="32"><figcaption>Favicon, 32 px</figcaption></figure>
    <figure><img class="circle" src="${maskable}" width="180" height="180"><figcaption>Android, maskable</figcaption></figure>
    <figure><img class="tile" src="${apple}" width="180" height="180"><figcaption>iPhone</figcaption></figure>
    <figure><img class="social" src="${social}"><figcaption>Link preview</figcaption></figure>
  </div>
</div>

<h2>In the app</h2>
<div class="bars">
  <div class="bar light"><div class="topbar">${morningMarkSvg(28, "tb1").replace("<svg ", '<svg class="mark" ')}<span class="title">Today</span><span class="gear"></span></div><p class="hello">Good morning, Alex.</p></div>
  <div class="bar dark"><div class="topbar">${morningMarkSvg(28, "tb2").replace("<svg ", '<svg class="mark" ')}<span class="title">Today</span><span class="gear"></span></div><p class="hello">Good evening, Alex.</p></div>
  <div class="panel" style="background:#fff;padding:0;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;height:128px;align-items:center">
    <div class="lockup light">${morningMarkSvg(32, "lk1").replace("<svg ", '<svg class="mark" ')}<span class="word">LifeFlow</span></div>
    <div class="lockup dark" style="height:100%">${morningMarkSvg(32, "lk2").replace("<svg ", '<svg class="mark" ')}<span class="word">LifeFlow</span></div>
  </div>
</div>

<h2>Opening the app</h2>
<div class="splashes">${splashFrame(120, "First light")}${splashFrame(700, "The sun comes up along the horizon")}${splashFrame(2200, "Good morning")}</div>
</body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: WIDTH, height: 1200 }, deviceScaleFactor: 2 });
    await p.setContent(await page(), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready).catch(() => undefined);
    // Freeze each splash frame at its moment.
    await p.evaluate(() => {
      document.querySelectorAll<HTMLElement>(".phone").forEach((phone) => {
        const t = parseFloat(getComputedStyle(phone).getPropertyValue("--t"));
        for (const a of phone.getAnimations({ subtree: true })) {
          a.pause();
          a.currentTime = t;
        }
      });
    });
    const buf = await p.screenshot({ type: "png", fullPage: true });
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, buf);
    console.log(`${path.relative(ROOT, OUT)}  ${(buf.length / 1024).toFixed(0)} KB`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
