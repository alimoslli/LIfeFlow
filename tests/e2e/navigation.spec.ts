import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("every section is one tap from Plan and Money", async ({ page }) => {
  await signUp(page, "Nav Tester");
  await page.goto("/plan");
  const plan = page.getByRole("navigation", { name: "Plan sections" });
  for (const [label, url] of [
    ["Calendar", /\/calendar/],
    ["To-dos", /\/tasks/],
    ["Classes", /\/school/],
    ["Work", /\/work/],
    ["Notes", /\/notes/],
    ["Agenda", /\/plan$/],
  ] as const) {
    await plan.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("navigation", { name: "Plan sections" }).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/money");
  const money = page.getByRole("navigation", { name: "Money sections" });
  await money.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(/\/finances\/transactions/);
  await page.getByRole("navigation", { name: "Money sections" }).getByRole("link", { name: "Investments" }).click();
  await expect(page).toHaveURL(/\/wealth/);
});

test("calendar moves between months and opens a day", async ({ page }) => {
  await signUp(page, "Cal Tester");
  await page.goto("/calendar");
  const heading = page.getByRole("heading", { level: 1 });
  const thisMonth = await heading.textContent();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(heading).not.toHaveText(thisMonth!);
  await page.getByRole("link", { name: /15: 0 items/ }).click();
  await expect(page.getByRole("region", { name: "Selected day" })).toContainText("15");
  await page.getByRole("link", { name: "Jump to today" }).click();
  await expect(heading).toHaveText(thisMonth!);
});

test("appearance can be set to light or dark and is remembered", async ({ page }) => {
  await signUp(page, "Theme Tester");
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Light" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Automatic" }).click();
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});
