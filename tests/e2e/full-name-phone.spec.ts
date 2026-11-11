import { expect, test } from "@playwright/test";
import { fillBirthday, pool, signUp } from "./helpers";

test("About you and Settings ask for a full name next to the name the skyling uses, both optional and keyboard friendly, 390 px", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const email = await signUp(page, "Maya Chen", { onboarding: "stay" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /^Hi/ })).toBeVisible();

  const nick = page.getByLabel("What should your skyling call you?");
  const full = page.getByLabel("Full name (optional)");
  await expect(nick).toBeVisible();
  await expect(full).toBeVisible();
  for (const f of [nick, full]) expect(Math.round((await f.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await expect(page.getByText("Never shown to other people.")).toBeVisible();
  // by keyboard: the nickname, then the full name
  await nick.focus();
  await page.keyboard.press("Tab");
  await expect(full).toBeFocused();
  await nick.fill("Maya");
  await full.fill("  Maya   Chen-Patel ");
  await page.getByRole("radio", { name: /^Both/ }).click();
  await fillBirthday(page, "2005-04-12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/full-name-about-you-phone.png", fullPage: true });
  await page.getByRole("button", { name: "Connect my sky" }).click();
  await expect(page.getByRole("heading", { name: "Connect your sky" })).toBeVisible();
  const row = async () => (await pool.query("select name, full_name from users where email = $1", [email])).rows[0];
  expect(await row()).toEqual({ name: "Maya", full_name: "Maya Chen-Patel" });

  // Settings: shown, edited and cleared.
  await pool.query(`update users set preferences = preferences || '{"onboarding":"done","tour":"done"}'::jsonb where email = $1`, [email]);
  await page.goto("/settings/profile");
  const sFull = page.getByLabel("Full name (optional)");
  await expect(sFull).toHaveValue("Maya Chen-Patel");
  await expect(page.getByLabel("What your skyling calls you")).toHaveValue("Maya");
  await sFull.fill("");
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect.poll(async () => (await row()).full_name).toBeNull();
  await ctx.close();
});
