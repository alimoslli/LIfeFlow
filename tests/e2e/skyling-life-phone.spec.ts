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

// Owner, 2026-11-11 (number 3, "I trust your judgement"): the skyling on the sky jumps for joy when something good happens,
// not only when a to-do is ticked on the line: a save from Today's bar (and a claimed star) cheers it too.
test("the skyling on the sky cheers when Today's bar saves something", async ({ page }) => {
  await signUp(page, "Joy Jump");
  await page.goto("/");
  await expect(page.locator('[data-testid="day-clock"] [data-pose]')).toHaveCount(1);
  // a cheer is about a second long: note every pose the sky's skyling takes from before the message is sent
  await page.evaluate(() => {
    const who = document.querySelector('[data-testid="day-clock"] [data-pose]') as HTMLElement;
    const seen = ((window as unknown as { lfPoses: string[] }).lfPoses = [] as string[]);
    new MutationObserver(() => seen.push(who.dataset.pose ?? "")).observe(who, { attributes: true, attributeFilter: ["data-pose"] });
  });
  const box = page.locator(".dc-dock").getByRole("textbox", { name: "Message Ray" });
  await box.fill(`/tool create_tasks {"tasks":[{"title":"Water the plants"}]}`);
  await box.press("Enter");
  await expect(page.locator('[data-testid="today-reply"]:visible').getByRole("list", { name: "Saved" })).toContainText("Water the plants", {
    timeout: 15_000,
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { lfPoses: string[] }).lfPoses.includes("celebrate")), { timeout: 3_000 }).toBe(true);
});
