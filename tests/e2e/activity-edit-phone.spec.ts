import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/** Owner, 2026-11-11: the Type menu in a transaction's editor was blank, and opening a row jumped to the top of the list. */
test("a transaction's editor shows its type and keeps your place in the list", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Maya Torres");
  const [acct] = await queryAsUser<{ id: string }>(
    email,
    "insert into financial_accounts (user_id, name, type) values (current_setting('app.user_id')::uuid, 'Everyday Checking', 'depository') returning id",
  );
  await queryAsUser(
    email,
    `insert into transactions (user_id, account_id, date, description, amount_cents, kind)
     select current_setting('app.user_id')::uuid, $1::uuid, (current_date - (g % 8))::date, 'Coffee Stop ' || g, -450 - g, 'expense' from generate_series(1, 30) g`,
    [acct.id],
  );
  await page.goto("/finances/transactions");
  const row = page.getByRole("link", { name: /Coffee Stop 25\b/ });
  await row.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(200);
  await row.click();
  await expect(page).toHaveURL(/edit=/);
  const type = page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="expense"]') })
    .last();
  await expect(type).toBeVisible();
  // every type has a name, and this one reads "Expense"
  expect(await type.locator("option").allTextContents()).toEqual([
    "Income",
    "Expense",
    "Transfer (own accounts)",
    "Refund",
    "Reimbursement",
    "Investment movement",
    "Adjustment",
  ]);
  await expect(type).toHaveValue("expense");
  // still near the same row, not back at the top
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before / 2);
});
