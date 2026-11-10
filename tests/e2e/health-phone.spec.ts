import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

test("Health on a phone: last night in the sky card, the week's bars, resting heart, and the log behind +", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = await signUp(page, "Health Maya");

  // Empty first: plain words, no made-up numbers.
  await page.goto("/habits");
  await expect(page.getByRole("heading", { level: 1, name: "Health" })).toBeVisible();
  await expect(page.getByText("No health data yet")).toBeVisible();
  await expect(page.getByTestId("last-night")).toHaveCount(0);

  // Seven nights of sleep, steps, exercise and a resting heart rate, in the user's own days (Apple Health source).
  const hours = [7, 6, 8, 6.5, 5.5, 8, 7.1667];
  for (let i = 0; i < 7; i++) {
    await queryAsUser(
      email,
      `insert into health_samples (user_id, metric, day, value, source)
       select u.id, 'sleep_hours', ((now() at time zone u.timezone)::date - $1::int), $2, 'apple_health' from users u where u.id = current_setting('app.user_id')::uuid`,
      [6 - i, hours[i]],
    );
  }
  await queryAsUser(
    email,
    `insert into health_samples (user_id, metric, day, value, source)
     select u.id, m.metric, ((now() at time zone u.timezone)::date - m.back), m.value, 'apple_health'
     from users u, (values ('steps', 1, 8120), ('steps', 2, 6240), ('exercise_minutes', 1, 30), ('exercise_minutes', 3, 45), ('resting_heart_rate', 0, 62)) as m(metric, back, value)
     where u.id = current_setting('app.user_id')::uuid`,
    [],
  );

  await page.goto("/habits");
  await expect(page.getByTestId("last-night")).toHaveText("7h 10m");
  await expect(page.getByText("Steps yesterday")).toBeVisible();
  await expect(page.getByText("8,120")).toBeVisible();
  await expect(page.getByText("62 beats a minute")).toBeVisible();
  await expect(page.getByText("Apple Health", { exact: true })).toBeVisible();
  await expect(page.getByTestId("sleep-bars").locator("[data-bar]")).toHaveCount(7);
  // No numbers on the bars: the chart holds only the seven day letters.
  await expect(page.getByTestId("sleep-bars")).toHaveText(/^[MTWFS]{7}$/);

  // Nothing sticks out sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The log is one tap deeper behind +, with the same form and action as before.
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await page.getByRole("button", { name: "Log something" }).click();
  await page.getByLabel("Amount").fill("9");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Logged sleep/i)).toBeVisible();
});
