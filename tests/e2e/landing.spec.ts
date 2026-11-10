import { expect, test } from "@playwright/test";
import { whatUsersSee } from "./helpers";

// Signed-out visitors land on the front page at "/", not the sign-in form.
test("a signed-out visitor sees the landing page and can get started", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText("Every app sees one slice. LifeFlow sees all of it.");
  await expect(page.locator("[data-app-loading]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See what it does" })).toHaveAttribute("href", "#moments");
  // Real logos for what it connects to.
  await expect(page.getByText("Connects to what you already use")).toBeVisible();
  // Questions open in place, and the Instagram link points at @lifeflowweb.
  await page.getByText("Is my data private?").click();
  await expect(page.getByText(/locked to your account/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Instagram/ }).first()).toHaveAttribute("href", "https://www.instagram.com/lifeflowweb");
  await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");

  await page.getByRole("link", { name: "Get started" }).first().click();
  await page.waitForURL("**/signup");
  // Sign-up asks only for email and password; the name comes on the first screen after.
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
});

test("the landing page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("legal pages have a close button that goes back to where you were", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText("Every app sees one slice. LifeFlow sees all of it.");

  await expect(page).toHaveURL(/\/$/);

  // The reworded intro: no "(we, us)" next to the operator's name.
  await page.goto("/terms");
  await expect(page.getByText(/agreement between you and LifeFlow, which is run by/)).toBeVisible();
});

// The skyling has no fixed name: public copy says "your skyling", never "Jarvis", and never "assistant"
// (owner, 2026-11-09: "AI assistant" is overused and it's not what LifeFlow is).
test("the landing and legal pages never call the skyling Jarvis or an assistant", async ({ page }) => {
  for (const path of ["/", "/privacy", "/terms", "/integrity"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await whatUsersSee(page), path).not.toMatch(/jarvis/i);
    expect(await whatUsersSee(page), path).not.toMatch(/\bassistants?\b/i);
  }
  await page.goto("/");
  await expect(page.getByText(/skyling/i).first()).toBeVisible();
});
