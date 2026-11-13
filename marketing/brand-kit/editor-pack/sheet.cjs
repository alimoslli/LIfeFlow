const { chromium } = require("playwright"); const path = require("path");
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: 1000 } });
  await p.goto("file://" + path.join(__dirname, "sheet.html")); await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300); await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close(); console.log("ok"); })();
