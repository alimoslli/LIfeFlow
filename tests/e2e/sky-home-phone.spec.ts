import { expect, type Page, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** The next celebration that played: "big" (the sun) or "small" (a star). */
async function nextCel(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { cels: string[] }).cels.length)).toBeGreaterThan(0);
  return page.evaluate(() => (window as unknown as { cels: string[] }).cels.splice(0));
}

async function addGoal(page: Page, title: string) {
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  await page.getByLabel("Goal", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByRole("button", { name: `Mark "${title}" done` })).toBeVisible();
}

// Owner, 2026-11-11: the skyling's cloud. Stars from what you finish unlock the small things, suns only from the big
// ones (a goal reached, a milestone) unlock the bigger ones, and the sun plays only when a sun is earned.
test("the skyling's cloud: a goal reached is a sun (and plays the sun), a to-do is a star, the sheet says what's next", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { cels: string[] };
    w.cels = [];
    document.addEventListener("lf:celebrate", (e) => w.cels.push((e as CustomEvent<{ size: string }>).detail.size));
  });
  const email = await signUp(page, "Cloud Cleo");

  // a new cloud: nothing on it yet, and the counts say so
  await page.goto("/jarvis");
  await expect(page.getByRole("button", { name: "0 stars, 0 suns. Open Ray's cloud" })).toBeVisible();

  // a goal reached: the sun plays, and a sun lands on the cloud (the balloon)
  await page.goto("/goals");
  await addGoal(page, "Run a 5K");
  await page.getByRole("button", { name: 'Mark "Run a 5K" done' }).click();
  expect(await nextCel(page)).toEqual(["big"]);

  // suns are for the big things: after two today, the next goal reached is a star, not the sun
  await addGoal(page, "Call grandma");
  await page.getByRole("button", { name: 'Mark "Call grandma" done' }).click();
  expect(await nextCel(page)).toEqual(["big"]);
  await addGoal(page, "Clean my room");
  await page.getByRole("button", { name: 'Mark "Clean my room" done' }).click();
  expect(await nextCel(page)).toEqual(["small"]);

  // a to-do ticked is a star
  await queryAsUser(email, "insert into tasks (user_id, title) values (current_setting('app.user_id')::uuid, 'Return library books')");
  await page.goto("/tasks");
  await page.getByRole("checkbox", { name: 'Mark "Return library books" done' }).click();
  await expect.poll(async () => (await queryAsUser(email, "select kind from sky_rewards where kind = 'star'")).length).toBe(1);

  // the skyling's page: its cloud with the balloon, and the sheet with what comes next
  await page.goto("/jarvis");
  const counts = page.getByRole("button", { name: "1 star, 2 suns. Open Ray's cloud" });
  await expect(counts).toBeVisible();
  await expect(page.getByTestId("sky-home").locator("svg[data-has]")).toHaveAttribute("data-has", "balloon");
  await counts.click();
  const sheet = page.getByRole("dialog", { name: "Ray's cloud" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Stars" })).toContainText("Next: star lights at 5");
  await expect(sheet.getByRole("region", { name: "Suns" })).toContainText("Next: cloud house at 3");
  await expect(sheet.getByRole("region", { name: "Suns" }).getByRole("listitem").first()).toContainText("On the cloud");
});
