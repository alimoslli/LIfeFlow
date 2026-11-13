// node render_seq.cjs <outDir> <seconds>  (30 fps)
const { chromium } = require("playwright"); const path = require("path"); const fs = require("fs");
(async () => {
  const out = process.argv[2], secs = Number(process.argv[3]); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: 700 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("file://" + path.join(__dirname, "billboard.html")); await p.evaluate(() => window.ready);
  const n = Math.round(secs * 30);
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => window.drawT(t), f / 30);
    await p.locator("#c").screenshot({ path: path.join(out, String(f + 1).padStart(4, "0") + ".png") });
  }
  console.log("frames", n); await b.close();
})();
