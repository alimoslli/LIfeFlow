import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner's reset (2026-11-10): someone with a job and no classes gets a Work tab where School would be, and Work looks like
// Money: the next shift on the sky, hours this week, the last paycheck (never predicted), the week, and pay that came in.
test("no classes: Work is a tab, and its page leads with the next shift", async ({ page }) => {
  const email = await signUp(page, "Wes Work");
  await pool.query(`update users set preferences = preferences || '{"lifeStage":"working"}'::jsonb where email = $1`, [email.toLowerCase()]);
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" }).last().getByRole("link");
  await expect(tabs).toHaveText(["Today", "Ray", "Money", "Work"]);
  await tabs.filter({ hasText: "Work" }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect(tabs.filter({ hasText: "Work" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.filter({ hasText: "Today" })).not.toHaveAttribute("aria-current", "page");

  // no job yet: one step, on the sky
  await expect(page.getByText("Add your job")).toBeVisible();
  await page.getByLabel("Employer").fill("Café Luna");
  await page.getByLabel("Hourly rate ($)").fill("16");
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("region", { name: "Next shift" })).toContainText("No shift planned");

  // a shift tomorrow becomes the next shift
  await queryAsUser(
    email,
    `insert into work_shifts (user_id, employer_id, starts_at, ends_at)
     select e.user_id, e.id, date_trunc('day', now()) + interval '1 day 15 hours', date_trunc('day', now()) + interval '1 day 21 hours' from employers e`,
  );
  await page.reload();
  const hero = page.getByRole("region", { name: "Next shift" });
  await expect(hero).toContainText("Next shift");
  await expect(hero).toContainText("Café Luna");
  await expect(hero).toContainText("Hours this week");
  await expect(hero).toContainText("None yet");
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shift", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paycheck", exact: true })).toBeVisible();

  // More doesn't repeat the Work tab, and its Goals door goes straight to Goals
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "Everything else" });
  await expect(more.locator('a[href="/goals"]')).toBeVisible();
  await expect(more.locator('a[href="/work"]')).toHaveCount(0);
});
