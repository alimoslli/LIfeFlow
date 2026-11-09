/**
 * Renders every icon the app ships from the morning mark (src/components/brand/morning-mark.ts), so the PNGs never
 * drift from the vector the app draws. Playwright screenshots the SVG (no image packages needed).
 *
 *   npx tsx scripts/brand-icons.ts
 *
 * Same file names and sizes as before: the manifest, layout metadata, the service worker and the e2e install test
 * all point at these paths.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { ICON_SKY, morningIconSvg, morningMarkInner, morningMarkSvg } from "../src/components/brand/morning-mark";

const ROOT = path.resolve(__dirname, "..");
/** Corner radius of a tile that keeps its own rounded corners (favicons, "any" icons). */
const CORNER = 0.22;
/** Maskable icons keep everything inside the inner 80%. */
const SAFE = 0.8;

type Job = { file: string; width: number; height?: number; svg: string; transparent?: boolean };

/** A home-screen shortcut: a plain white glyph on the icon's calm ground. */
function shortcutSvg(size: number, glyph: string, id: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ICON_SKY.groundTop}"/><stop offset="1" stop-color="${ICON_SKY.groundBottom}"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="100" height="100" rx="${CORNER * 100}" fill="url(#${id}g)"/>`,
    `<g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`,
    `</svg>`,
  ].join("");
}

const GLYPHS = {
  // The assistant: a four-point spark, the same idea as the chat's icon.
  jarvis: `<path d="M50 24 C52 40 60 48 76 50 C60 52 52 60 50 76 C48 60 40 52 24 50 C40 48 48 40 50 24 Z" fill="#ffffff" stroke="none"/>`,
  // A to-do: one tick.
  todo: `<path d="M28 52 L44 67 L72 36"/>`,
  // Spending: a coin.
  spending: `<circle cx="50" cy="50" r="25"/><path d="M57 41 H46 a6.5 6.5 0 0 0 0 13 H54 a6.5 6.5 0 0 1 0 13 H43" stroke-width="6"/><path d="M50 35 V65" stroke-width="5"/>`,
};

/** The link preview (1200 x 630): the mark on the morning sky with the name beside it. */
function socialSvg(): string {
  const w = 1200;
  const h = 630;
  const hy = 0.72;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${ICON_SKY.top}"/><stop offset="${hy * 0.5}" stop-color="${ICON_SKY.mid}"/>`,
    `<stop offset="${hy * 0.86}" stop-color="${ICON_SKY.low}"/><stop offset="${hy}" stop-color="${ICON_SKY.horizon}"/>`,
    `<stop offset="${hy + 0.001}" stop-color="${ICON_SKY.groundTop}"/><stop offset="1" stop-color="${ICON_SKY.groundBottom}"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${w}" height="${h}" fill="url(#sk)"/>`,
    // The mark, 420 px wide, its horizon on the picture's horizon.
    `<g transform="translate(${w / 2 - 210} ${h * hy - 0.66 * 420}) scale(4.2)">${morningMarkInner("so")}</g>`,
    `<text x="${w / 2}" y="${h * hy + 92}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="88" font-weight="500" letter-spacing="-3" fill="#ffffff">LifeFlow</text>`,
    `<text x="${w / 2}" y="${h * hy + 140}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="26" fill="#ffffff" fill-opacity="0.78">Your whole life, in flow.</text>`,
    `</svg>`,
  ].join("");
}

const JOBS: Job[] = [
  // What the app links to (src/app/layout.tsx, manifest.ts, sw.js).
  { file: "public/brand/lifeflow-mark-192.png", width: 192, svg: morningIconSvg(192, { corner: CORNER }), transparent: true },
  { file: "public/brand/lifeflow-mark-512.png", width: 512, svg: morningIconSvg(512, { corner: CORNER }), transparent: true },
  { file: "public/brand/lifeflow-mark-transparent-512.png", width: 512, svg: morningMarkSvg(512), transparent: true },
  { file: "public/brand/lifeflow-maskable-512.png", width: 512, svg: morningIconSvg(512, { safe: SAFE }) },
  { file: "public/brand/lifeflow-apple-touch.png", width: 180, svg: morningIconSvg(180) },
  { file: "public/brand/lifeflow-social.png", width: 1200, height: 630, svg: socialSvg() },
  { file: "src/app/icon.png", width: 512, svg: morningIconSvg(512, { corner: CORNER }), transparent: true },
  // The older /icons set, still served and cached by the service worker.
  { file: "public/icons/apple-touch-icon.png", width: 180, svg: morningIconSvg(180) },
  { file: "public/icons/icon-192.png", width: 192, svg: morningIconSvg(192, { corner: CORNER }), transparent: true },
  { file: "public/icons/icon-512.png", width: 512, svg: morningIconSvg(512, { corner: CORNER }), transparent: true },
  { file: "public/icons/maskable-512.png", width: 512, svg: morningIconSvg(512, { safe: SAFE }) },
  { file: "public/icons/shortcut-jarvis.png", width: 96, svg: shortcutSvg(96, GLYPHS.jarvis, "sj"), transparent: true },
  { file: "public/icons/shortcut-todo.png", width: 96, svg: shortcutSvg(96, GLYPHS.todo, "st"), transparent: true },
  { file: "public/icons/shortcut-spending.png", width: 96, svg: shortcutSvg(96, GLYPHS.spending, "ss"), transparent: true },
];

/** Google's Fraunces for the social picture when the network allows it; Georgia otherwise. */
const FONT_LINK = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap">`;

export async function renderPng(browser: Browser, svg: string, width: number, height: number, transparent = false): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<!doctype html><html><head>${FONT_LINK}</head><body style="margin:0;background:transparent">${svg}</body></html>`, {
      waitUntil: "load",
    });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    return await page.screenshot({ type: "png", omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const job of JOBS) {
      const height = job.height ?? job.width;
      const png = await renderPng(browser, job.svg, job.width, height, job.transparent);
      const out = path.join(ROOT, job.file);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, png);
      console.log(`${job.file}  ${job.width}x${height}  ${(png.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
