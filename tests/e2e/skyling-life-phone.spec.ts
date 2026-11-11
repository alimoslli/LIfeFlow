import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-11: the skyling says hello when you come, a moment after Today opens (not with reduced motion).
test("the skyling waves when Today opens", async ({ page }) => {
  await signUp(page, "Wes Wave");
  await page.goto("/");
  await expect(page.locator('[data-pose="wave"]')).toHaveCount(1, { timeout: 5_000 });
});

// With reduced motion the skyling stands still: no timer, and none of the page's moments (the wave is a few seconds long).
test("with reduced motion the skyling doesn't wave", async ({ page }) => {
  await signUp(page, "Wes Still");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-pose]")).toHaveCount(1);
  // the wave would have shown in the first few seconds after the page opened; wait past that window before checking
  await page.waitForTimeout(3_500);
  await expect(page.locator('[data-pose="wave"]')).toHaveCount(0);
});
