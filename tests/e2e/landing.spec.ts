import { expect, test } from "@playwright/test";

// Signed-out visitors land on the front page at "/", not the sign-in form.
test("a signed-out visitor sees the landing page and can get started", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your whole life, in flow.");
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");

  await page.getByRole("link", { name: "Get started" }).first().click();
  await page.waitForURL("**/signup");
  await expect(page.getByLabel("Your name")).toBeVisible();
});

test("the landing page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
