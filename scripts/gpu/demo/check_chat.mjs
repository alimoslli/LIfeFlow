// Signs in to the demo app the way a person would and asks the skyling one question, to prove the whole path works:
// the link's password, the sign-in, the chat, the tools, the model, the answer on the screen. Made-up demo data only.
//   node scripts/gpu/demo/check_chat.mjs <base url> <link login or -> <link password or -> <demo email> <demo password> ["question"]
// Prints one JSON line: { ok, seconds, answer } or { ok: false, error }.
const [base, linkUser, linkPass, email, password, question = "What do I need to get done today?"] = process.argv.slice(2);
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import("@playwright/test"));
}
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  httpCredentials: linkUser && linkUser !== "-" ? { username: linkUser, password: linkPass } : undefined,
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
let result;
try {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await page.goto(base + "/jarvis", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const box = page.getByLabel(/^Message /).first();
  const allow = page.getByRole("button", { name: "Allow", exact: true });
  // a first chat asks once for permission to use AI
  await Promise.race([box.waitFor({ timeout: 30_000 }), allow.first().waitFor({ timeout: 30_000 })]).catch(() => {});
  if (await allow.count()) await allow.first().click();
  await box.waitFor({ timeout: 30_000 });
  const t0 = Date.now();
  await box.fill(question);
  await box.press("Enter");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Send" }).waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(500);
  const text = (await page.locator("[data-chat-scroll]").innerText()).trim();
  // everything after the question as it shows in the chat: the skyling's answer
  const at = text.lastIndexOf(question);
  const answer = (at >= 0 ? text.slice(at + question.length) : text.slice(-1200)).trim().slice(0, 1200);
  result = { ok: answer.length > 0, seconds: Math.round((Date.now() - t0) / 100) / 10, url: page.url().replace(base, ""), answer };
} catch (e) {
  result = { ok: false, error: String(e.message || e).slice(0, 400), url: page.url().replace(base, "") };
  await page.screenshot({ path: "/tmp/check_chat_fail.png" }).catch(() => {});
}
console.log(JSON.stringify(result));
await browser.close();
process.exit(result.ok ? 0 : 1);
