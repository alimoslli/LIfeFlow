import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("core pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await signUp(page, "Phone User", { onboarding: "stay" });
  // Every onboarding step fits: hello, what LifeFlow does, how data gets in, your week, make it yours.
  const fits = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `/welcome (${label}) overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  };
  await fits("hello");
  await page.getByRole("button", { name: "Show me" }).click();
  await fits("what");
  await page.getByRole("button", { name: "Continue" }).click();
  await fits("add");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /Both/ }).click();
  await fits("week");
  await page.getByRole("button", { name: "Continue" }).click();
  await fits("yours");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Skip tour" }).click();
  for (const path of ["/", "/plan", "/money", "/tasks", "/school", "/calendar", "/finances", "/work", "/notes", "/jarvis", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plan" }).click();
  await expect(page).toHaveURL(/\/plan/);
});

test("Extra large text still fits a phone screen", async ({ page, context, baseURL }) => {
  await signUp(page, "Big Text");
  await context.addCookies([{ name: "lf_text", value: "xlarge", url: baseURL! }]);
  for (const path of ["/", "/plan", "/money", "/school", "/jarvis", "/settings", "/settings/profile", "/settings/invite"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-text", "xlarge");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px at Extra large text`).toBeLessThanOrEqual(1);
  }
});

test("is installable: manifest and icons load without signing in", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "LifeFlow", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});
