import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

/** Category rules open over Activity, not on a page of their own (owner's page map, 2026-11-10). */
test("category rules open over Activity, from its menu and from the old address", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, "Maya Torres");

  await page.goto("/finances/rules");
  await expect(page).toHaveURL(/\/finances\/transactions\?rules=1$/);
  const rules = page.getByRole("dialog", { name: "Category rules" });
  await expect(rules.getByText("No rules yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rules).toBeHidden();
  await expect(page).toHaveURL(/\/finances\/transactions$/);

  // From the page's own menu.
  await page.getByLabel("More options").click();
  await page.getByRole("link", { name: "Category rules" }).click();
  await expect(page.getByRole("dialog", { name: "Category rules" })).toBeVisible();
});
