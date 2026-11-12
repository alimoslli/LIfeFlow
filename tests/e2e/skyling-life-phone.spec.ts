import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-11: the skyling says hello when you come, a moment after Today opens.
test("the skyling waves when Today opens", async ({ page }) => {
  await signUp(page, "Wes Wave");
  await page.goto("/");
  await expect(page.locator('[data-pose="wave"]')).toHaveCount(1, { timeout: 5_000 });
});

// With reduced motion the skyling stands still, but its reactions still play (owner, 2026-11-12: "i want the reactions
// ... that's not enough motion"): it waves when Today opens, and then it's still again.
test("with reduced motion the skyling still waves, then stands still", async ({ page }) => {
  await signUp(page, "Wes Still");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator('[data-pose="wave"]')).toHaveCount(1, { timeout: 5_000 });
  // then the wave is over (it goes back to whatever the hour has it doing, still)
  await expect(page.locator('[data-pose="wave"]')).toHaveCount(0, { timeout: 8_000 });
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

test("with reduced motion the skyling on the sky still cheers when Today's bar saves something", async ({ page }) => {
  await signUp(page, "Joy Still");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator('[data-testid="day-clock"] [data-pose]')).toHaveCount(1);
  await page.evaluate(() => {
    const who = document.querySelector('[data-testid="day-clock"] [data-pose]') as HTMLElement;
    const seen = ((window as unknown as { lfPoses: string[] }).lfPoses = [] as string[]);
    new MutationObserver(() => seen.push(who.dataset.pose ?? "")).observe(who, { attributes: true, attributeFilter: ["data-pose"] });
  });
  const box = page.locator(".dc-dock").getByRole("textbox", { name: "Message Ray" });
  await box.fill(`/tool create_tasks {"tasks":[{"title":"Feed the cat"}]}`);
  await box.press("Enter");
  await expect(page.locator('[data-testid="today-reply"]:visible').getByRole("list", { name: "Saved" })).toContainText("Feed the cat", { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { lfPoses: string[] }).lfPoses.includes("celebrate")), { timeout: 3_000 }).toBe(true);
});
