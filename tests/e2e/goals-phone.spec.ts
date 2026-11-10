import { expect, test, type Page } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/** Set SHOTS=<dir> to save phone screenshots of each view. */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.screenshot({ path: `${process.env.SHOTS}/${name}-${theme}.png`, fullPage: true });
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme);
};

test("Goals: the closest goal on top, Aiming for and Done in one page, both add buttons, and /milestones redirects", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const email = await signUp(page, "Maya Goals");

  // real rows: one goal seven books in, one with a date and no number, one done
  await queryAsUser(
    email,
    `insert into personal_goals (user_id, title, target, progress, unit) values (current_setting('app.user_id')::uuid, 'Read 12 books', 12, 7, 'books')`,
  );
  await queryAsUser(
    email,
    `insert into personal_goals (user_id, title, target_date) values (current_setting('app.user_id')::uuid, 'Run a 5K', to_char(current_date + 20, 'YYYY-MM-DD')::date)`,
  );
  await queryAsUser(
    email,
    `insert into life_milestones (user_id, title, category, happened_on, precision) values
       (current_setting('app.user_id')::uuid, 'Started at Cafe Luna', 'work', (date_trunc('month', current_date)::date + 2), 'day'),
       (current_setting('app.user_id')::uuid, 'Graduated from Lincoln High', 'school', '2022-01-01', 'year')`,
  );

  await page.goto("/goals");
  // Aiming for: the hero names the closest goal, the tiles list the open ones
  const hero = page.getByRole("region", { name: "Closest goal" });
  await expect(hero).toContainText("Read 12 books");
  await expect(hero).toContainText("7 done, 5 to go");
  await expect(hero.getByRole("img", { name: "7 of 12" })).toBeVisible();
  const aiming = page.getByRole("region", { name: "Aiming for" });
  await expect(aiming).toContainText("Run a 5K");
  await expect(aiming).toContainText("7 of 12 books");
  await shot(page, "goals-aiming");

  // a goal opens its full card one tap deeper
  await aiming.getByRole("button", { name: /^Run a 5K/ }).click();
  await expect(page.getByRole("dialog", { name: "Run a 5K" }).getByText("Edit")).toBeVisible();
  await page.keyboard.press("Escape");

  // + Goal opens the form; saving closes it and the goal appears
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add a goal" });
  await add.getByLabel("Goal", { exact: true }).fill("Save for Lisbon");
  await add.getByRole("button", { name: "Add goal" }).click();
  await expect(add).toBeHidden();
  await expect(aiming).toContainText("Save for Lisbon");

  // the switch: Done lists milestones by month, with the count in the hero
  await page.getByRole("navigation", { name: "Goals" }).getByRole("link", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/goals\?view=done$/);
  const thisYear = new Date().getFullYear();
  await expect(page.getByRole("region", { name: `Done in ${thisYear}` })).toContainText("1");
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  await expect(page.getByRole("region", { name: month })).toContainText("Started at Cafe Luna");
  await expect(page.getByRole("region", { name: "2022" })).toContainText("Graduated from Lincoln High");
  await shot(page, "goals-done");

  // + Milestone opens its form
  await page.getByRole("button", { name: "Milestone", exact: true }).click();
  const ms = page.getByRole("dialog", { name: "Add a milestone" });
  await ms.getByLabel("What happened", { exact: true }).fill("Ran my first mile");
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();
  await expect(page.getByRole("button", { name: /^Ran my first mile/ })).toBeVisible();

  // an old milestone opens to edit or delete
  await page.getByRole("button", { name: /^Graduated from Lincoln High/ }).click();
  await expect(page.getByRole("dialog", { name: "Graduated from Lincoln High" }).getByRole("button", { name: "Save" })).toBeVisible();
  await page.keyboard.press("Escape");

  // the old address redirects and keeps its query
  await page.goto("/milestones?imported=1.1.0");
  await expect(page).toHaveURL(/\/goals\?imported=1\.1\.0&view=done$/);
  await expect(page.getByRole("status")).toContainText("Imported 1 about you, 1 milestone");

  // nothing slides sideways on a phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
