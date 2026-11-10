import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/** Recently deleted is part of "Privacy and your data" (owner's page map, 2026-11-10): bring something back from there. */
test("a deleted to-do comes back from Privacy and your data; the old address lands there", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Maya Torres");

  // The to-do is made directly (the phone's add box sits behind a button); deleting and bringing it back go through the screen.
  const [t] = await queryAsUser<{ id: string }>(
    email,
    "insert into tasks (user_id, title) values (current_setting('app.user_id')::uuid, 'Call the dentist') returning id",
  );
  await page.goto(`/tasks/${t.id}`);
  await page.getByRole("button", { name: "Delete Call the dentist" }).click();
  // back on the list, with Undo offered right there
  await expect(page).toHaveURL(/\/tasks(\?undo=[0-9a-f-]+)?$/);

  await page.goto("/settings/trash");
  await expect(page).toHaveURL(/\/settings\/data#deleted$/);
  const deleted = page.getByRole("region", { name: "Recently deleted" });
  await expect(deleted.getByText("Call the dentist")).toBeVisible();
  await deleted.getByRole("button", { name: "Restore Call the dentist" }).click();
  await expect(deleted.getByText("Nothing here.")).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByText("Call the dentist")).toBeVisible();
});
