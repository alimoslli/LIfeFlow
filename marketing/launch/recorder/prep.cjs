// Logs in to the fresh demo account, allows the assistant (consent), dismisses the sample-data pill. Not filmed.
const { chromium } = require("playwright");
const fs = require("fs");
const B = "http://localhost:3000";
const OFF = Number(fs.readFileSync(__dirname + "/off.txt", "utf8").trim()) * 1000;
const SHIM = `(() => { const RD = Date, rnow = RD.now.bind(RD); class D extends RD { constructor(...a) { if (a.length === 0) super(rnow() + ${OFF}); else super(...a); } static now() { return rnow() + ${OFF}; } } D.parse = RD.parse; D.UTC = RD.UTC; window.Date = D; })();`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "America/New_York" });
  await ctx.addInitScript(SHIM);
  const p = await ctx.newPage();
  await p.goto(B + "/login");
  await p.fill("input[name=email]", "demo@budgetflow.local");
  await p.fill("input[name=password]", "budgetflow-demo");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.goto(B + "/jarvis");
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(1500);
  await p
    .getByRole("button", { name: "Allow", exact: true })
    .click({ timeout: 5000 })
    .then(() => console.log("allowed"))
    .catch(() => console.log("no consent prompt"));
  await p.waitForTimeout(1500);
  await p.goto(B + "/");
  await p.waitForTimeout(1500);
  const x = p.locator('button[aria-label*="ample"], button[aria-label*="ismiss"]').first();
  await x
    .click({ timeout: 2000 })
    .then(() => console.log("pill dismissed"))
    .catch(() => console.log("pill stays (hidden in film)"));
  await p.waitForTimeout(800);
  await ctx.storageState({ path: __dirname + "/state.json" });
  console.log(
    "Send button:",
    await p
      .goto(B + "/jarvis")
      .then(() => p.waitForTimeout(1200))
      .then(() => p.getByRole("button", { name: /^Send/ }).count()),
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
