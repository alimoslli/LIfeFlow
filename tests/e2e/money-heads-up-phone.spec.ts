import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/**
 * Money shows one heads-up at a time (owner, 2026-11-16: yes on the picture): the first in full, the others one tap
 * away under "2 more heads-ups". Three budgets that are already over, written the way a connected account holds them.
 */
test("Money shows one heads-up, the rest open with a tap", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Maya Torres");
  const me = `current_setting('app.user_id')::uuid`;
  // the person's own day, so the budgets and the spending are in the same month wherever the test runs
  const today = `(now() at time zone (select timezone from users where id = ${me}))::date`;
  await queryAsUser(
    email,
    `insert into financial_accounts (user_id, name, type, subtype, current_balance_cents) values (${me}, 'Checking', 'depository', 'checking', 500000)`,
  );
  for (const name of ["Pets", "Travel", "Lifestyle"]) {
    await queryAsUser(
      email,
      `insert into budgets (user_id, month, category_id, limit_cents)
       select ${me}, date_trunc('month', ${today})::date, c.id, 1000 from categories c where c.user_id = ${me} and c.name = $1`,
      [name],
    );
    await queryAsUser(
      email,
      `insert into transactions (user_id, account_id, date, description, merchant_name, amount_cents, kind, category_id)
       select ${me}, a.id, ${today}, $1, $1, -5000, 'expense', c.id
       from financial_accounts a, categories c where a.user_id = ${me} and c.user_id = ${me} and c.name = $1`,
      [name],
    );
  }

  await page.goto("/money");
  const headsUp = page.getByRole("region", { name: "Heads up" });
  await expect(headsUp).toBeVisible();
  // one in view, with its way out
  await expect(headsUp.getByText(/is over budget/).filter({ visible: true })).toHaveCount(1);
  await expect(headsUp.getByRole("link", { name: /Make a plan/ }).filter({ visible: true })).toHaveCount(1);

  // the other two are one tap away, on a row big enough for a thumb
  const more = headsUp.getByText("2 more heads-ups");
  await expect(more).toBeVisible();
  expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(headsUp.getByText(/is over budget/).filter({ visible: true })).toHaveCount(3);
  for (const name of ["Pets", "Travel", "Lifestyle"]) await expect(headsUp.getByText(`${name} is over budget: $50 of $10.`)).toBeVisible();
});
