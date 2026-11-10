import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-10: a different star each time something gets done, and for a milestone or a goal reached a bigger
// sun that pops up, sticks its tongue out and wiggles, with a pop sound. The pictures are canvases drawn in code, so
// this checks what a person can tell: the tag that comes with each, that it clears itself, and that nothing breaks.
test("reaching a goal brings the milestone sun, one more toward a goal brings a star, and both clear themselves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await signUp(page, "Goal Gia");
  await page.goto("/goals");
  await page.getByLabel("Goal", { exact: true }).fill("Read 2 books");
  await page.getByLabel("Number (optional)").fill("2");
  await page.getByLabel("Of what").fill("books");
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByText("0 of 2 books")).toBeVisible();

  // one more, not there yet: a star with its "+1"
  await page.getByRole("button", { name: 'One more for "Read 2 books"' }).click();
  const layer = page.locator("body > div[aria-hidden=true]").filter({ has: page.locator("canvas") });
  await expect(layer.getByText("+1", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 2 books")).toBeVisible();
  await expect(layer).toHaveCount(0, { timeout: 6000 });

  // the last one reaches the goal: the sun, with its tag
  await page.getByRole("button", { name: 'One more for "Read 2 books"' }).click();
  await expect(layer.getByText("Goal reached!")).toBeVisible();
  const sun = layer.locator("canvas").first();
  await expect(sun).toHaveAttribute("width", "47");
  await expect(layer).toHaveCount(0, { timeout: 8000 });
  expect(errors).toEqual([]);
});

test("with reduced motion the celebration is a still picture that fades, not a dance", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await signUp(page, "Calm Cam");
  await page.goto("/goals");
  await page.getByLabel("Goal", { exact: true }).fill("Finish the essay");
  await page.getByRole("button", { name: "Add goal" }).click();
  await page.getByRole("button", { name: 'Mark "Finish the essay" done' }).click();
  const layer = page.locator("body > div[aria-hidden=true]").filter({ has: page.locator("canvas") });
  await expect(layer.getByText("Goal reached!")).toBeVisible();
  // no confetti squares, only the picture and its tag
  expect(await layer.locator(":scope > div").count()).toBe(1);
  await expect(layer).toHaveCount(0, { timeout: 6000 });
  await context.close();
});
