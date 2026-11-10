const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/login", { waitUntil: "domcontentloaded", timeout: 180000 });
  console.log("at", page.url());
  await page.screenshot({ path: process.argv[2] + "/login.png" });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  await email.fill("demo@budgetflow.local");
  await page.locator('input[type="password"]').first().fill("budgetflow-demo");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !/login|sign-in/.test(u.toString()), { timeout: 180000 }).catch(() => {});
  console.log("after login", page.url());
  await page.goto("http://localhost:3100/?splash=0", { waitUntil: "networkidle", timeout: 240000 }).catch((e) => console.log("goto", e.message));
  await page.waitForTimeout(4000);
  console.log("today", page.url());
  await page.screenshot({ path: process.argv[2] + "/today.png" });
  const dc = page.locator('[data-testid="day-clock"]');
  console.log("dc count", await dc.count());
  if (await dc.count()) { const bb = await dc.first().boundingBox(); console.log("bbox", JSON.stringify(bb)); await dc.first().screenshot({ path: process.argv[2] + "/dc.png" }); }
  await ctx.storageState({ path: process.argv[2] + "/state.json" });
  await browser.close();
})();
