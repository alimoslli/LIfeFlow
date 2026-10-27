import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("core pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await signUp(page, "Phone User");
  for (const path of ["/", "/tasks", "/school", "/calendar", "/finances", "/work", "/notes", "/jarvis", "/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/\/calendar/);
});
