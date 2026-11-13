// node render.cjs <minute> <out.png>
const { chromium } = require("playwright"); const path = require("path");
(async () => {
  const [minute, out] = [Number(process.argv[2]), process.argv[3]];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: 700 } });
  p.on("console", (m) => console.log("page:", m.text())); p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("file://" + path.join(__dirname, "billboard.html")); await p.evaluate(() => window.ready);
  const key = await p.evaluate((m) => window.draw(m), minute);
  await p.locator("#c").screenshot({ path: out }); console.log("drew", key, out); await b.close();
})();
