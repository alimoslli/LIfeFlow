const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const dir = process.argv[2], scale = Number(process.argv[3] || 1), out = process.argv[4];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: scale });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("file://" + path.join(dir, "brand_notsun.html"));
  await p.evaluate(() => window.ready);
  await p.evaluate(() => window.overview()); await p.waitForTimeout(100);
  await p.locator("#s").screenshot({ path: path.join(out, "LifeFlow_NotSun_0_All_5.png") });
  const names = ["Your_skyling", "Little_cloud", "Sleepy_moon", "The_days_path", "Whoevers_up"];
  for (let i = 0; i < 5; i++) { await p.evaluate((i) => window.sheet(i), i); await p.waitForTimeout(100);
    const h = await p.evaluate(() => document.getElementById("s").offsetHeight); console.log(i, h);
    await p.locator("#s").screenshot({ path: path.join(out, `LifeFlow_NotSun_${i + 1}_${names[i]}.png`) }); }
  await b.close();
})();
