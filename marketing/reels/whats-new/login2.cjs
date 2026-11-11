// Sign the test account in on the film database and keep the browser state for the shots.
const { chromium } = require("playwright"); const path = require("path");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 432, height: 768 }, timezoneId: "America/New_York" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3100/login", { waitUntil: "networkidle" });
  await p.getByLabel(/email/i).first().fill("demo@budgetflow.local");
  await p.getByLabel(/password/i).first().fill("budgetflow-demo");
  await p.getByRole("button", { name: /^(sign in|log in|continue)$/i }).first().click();
  await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000); console.log("at", p.url());
  await ctx.storageState({ path: path.join(__dirname, "state2.json") });
  await p.screenshot({ path: path.join(__dirname, "cap/login2.png") });
  await b.close();
})();
