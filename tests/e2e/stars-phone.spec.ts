import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Owner, 2026-11-10: coming back to Today, what the skyling passed while you were away is a star each, one by one,
// each saying what it was for, and the sun to finish a few. Claimed once: a reload plays nothing.
test("coming back: a star for each thing the skyling passed, one by one with its words, then the sun; once", async ({ page }) => {
  const email = await signUp(page, "Sky Star");
  // they last looked three hours ago; since then two classes and the gym ended, and a class is still going
  await pool.query(`update users set preferences = preferences || jsonb_build_object('starsClaimedAt', (now() - interval '3 hours')::text) where email = $1`, [
    email,
  ]);
  await queryAsUser(
    email,
    `insert into calendar_events (user_id, title, starts_at, ends_at, kind) values
       (current_setting('app.user_id')::uuid, 'Bio 101', now() - interval '150 minutes', now() - interval '90 minutes', 'class'),
       (current_setting('app.user_id')::uuid, 'Chem 110', now() - interval '80 minutes', now() - interval '30 minutes', 'class'),
       (current_setting('app.user_id')::uuid, 'Gym', now() - interval '25 minutes', now() - interval '5 minutes', 'personal'),
       (current_setting('app.user_id')::uuid, 'Night class', now() - interval '10 minutes', now() + interval '60 minutes', 'class')`,
  );

  await page.goto("/?stars=1");
  // one by one, in the order they ended, each saying what it was for
  for (const words of ["Bio 101 · class done", "Chem 110 · class done", "Gym · done", "3 done while you were away"])
    await expect(page.getByText(words, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Night class · class done")).toHaveCount(0);
  await expect(page.getByTestId("claimed-stars")).toHaveText("3 done while you were away: Bio 101, Chem 110, Gym.");

  // claimed once, on the account: a reload plays nothing
  await page.reload();
  await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
  await page.waitForTimeout(2_500);
  await expect(page.getByText("Bio 101 · class done")).toHaveCount(0);
  await expect(page.getByTestId("claimed-stars")).toHaveText("");
});
