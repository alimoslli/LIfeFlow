const { chromium } = require("playwright"); const path = require("path");
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 2000 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("file://" + path.join(__dirname, "page.html")); await p.evaluate(() => window.ready);
  const shot = (f) => p.locator("#c").screenshot({ path: path.join(OUT, f), omitBackground: true });
  for (const [k, n, fl] of [["dawn", false], ["ray", false], ["goldie", false], ["star", false], ["moon", false], ["star", true], ["moon", true, true]]) {
    const name = await p.evaluate(([k, n, fl]) => window.skyling(k, n, fl), [k, n, fl]);
    await shot(`skylings/${name}${n ? "-night" : ""}.png`); console.log("skyling", name, n ? "night" : "day");
  }
  for (let i = 0; i < 3; i++) for (const n of [false, true]) { await p.evaluate(([i, n]) => window.cloud(i, n, 220, 50, 8), [i, n]); await shot(`clouds/pixel-cloud-${i + 1}-${n ? "night" : "day"}.png`); }
  await p.evaluate((u) => window.caption(u), "today.jpg"); await p.locator("#c").screenshot({ path: path.join(OUT, "examples/caption-style.jpg"), type: "jpeg", quality: 90 });
  await b.close();
})();
