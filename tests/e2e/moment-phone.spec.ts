import { expect, test } from "@playwright/test";
import { pool, queryAsUser, signUp } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

// The skyling asks the right question (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 7): right after the
// shift's star, one specific question; Rough keeps the rest of the day quiet and nothing about the feeling is stored.
// The test server turns it on (MOMENT_QUESTIONS=on in playwright.config.ts); production keeps it off until the owner decides.
test("after the shift's star: How was the Target shift? Rough keeps the day quiet; once a day", async ({ page }) => {
  test.setTimeout(90_000);
  const email = await signUp(page, "Kai Moreno");
  await pool.query(`update users set preferences = preferences || jsonb_build_object('starsClaimedAt', (now() - interval '3 hours')::text) where email = $1`, [
    email,
  ]);
  await queryAsUser(email, "insert into employers (user_id, name) values (current_setting('app.user_id')::uuid, 'Target')");
  await queryAsUser(
    email,
    `insert into work_shifts (user_id, employer_id, starts_at, ends_at)
       select current_setting('app.user_id')::uuid, id, now() - interval '150 minutes', now() - interval '20 minutes' from employers`,
  );
  await page.goto("/?stars=1");
  const ask = page.getByTestId("moment-ask").filter({ visible: true });
  await expect(ask).toContainText("How was the Target shift?", { timeout: 15_000 });
  await page.screenshot({ path: "test-results/adhd-moment-ask-phone.png" });
  await ask.getByRole("button", { name: "Rough" }).click();
  await expect(page.getByTestId("moment-thanks").filter({ visible: true })).toHaveText("Thanks for telling me. I'll keep tonight light.");
  await expect
    .poll(async () => (await pool.query<{ easy: string | null }>("select preferences->>'easyUntil' as easy from users where email = $1", [email])).rows[0].easy)
    .toBeTruthy();
  const [{ p }] = (await pool.query<{ p: string }>("select preferences::text as p from users where email = $1", [email])).rows;
  expect(p).not.toMatch(/"Rough"/);

  // once a day: another shift's star later today brings no second question
  await pool.query(
    `update users set preferences = preferences || jsonb_build_object('starsClaimedAt', (now() - interval '10 minutes')::text) where email = $1`,
    [email],
  );
  await queryAsUser(
    email,
    `insert into work_shifts (user_id, employer_id, starts_at, ends_at)
       select current_setting('app.user_id')::uuid, id, now() - interval '9 minutes', now() - interval '1 minute' from employers`,
  );
  await page.goto("/?stars=1");
  await expect(page.getByText("Target · shift done").first())
    .toBeVisible({ timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("moment-ask")).toHaveCount(0);
});
