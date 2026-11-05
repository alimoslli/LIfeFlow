// Renders mg.html frame by frame (deterministic seek) to frames/NNNNN.jpg. Usage: node render.cjs <seconds> [preview t1,t2,...]
const { chromium } = require("playwright");
const fs = require("fs");
const FPS = 30;
(async () => {
  const dur = Number(process.argv[2] || 9.6);
  const prev = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
  await p.goto("file://" + __dirname + "/mg.html");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const out = __dirname + (prev ? "/prev" : "/frames");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);
  const times = prev || Array.from({ length: Math.round(dur * FPS) }, (_, i) => i / FPS);
  for (const [i, t] of times.entries()) {
    await p.evaluate((t) => window.seek(t), t);
    await p.screenshot({ path: `${out}/${prev ? "p_" + t.toFixed(2) : String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  await b.close();
  console.log("done", times.length);
})();
