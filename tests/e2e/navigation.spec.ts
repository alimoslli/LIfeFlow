import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("five tabs, and every section is one tap from its tab", async ({ page }) => {
  await signUp(page, "Nav Tester");
  const groups = [
    [
      "/plan",
      "Plan sections",
      [
        ["To-dos", /\/tasks/],
        ["Work", /\/work/],
        ["Trips", /\/trips/],
        ["Calendar", /\/plan$/],
      ],
    ],
    [
      "/money",
      "Money sections",
      [
        ["Transactions", /\/finances\/transactions/],
        ["Accounts & wallet", /\/finances\/accounts/],
        ["Overview", /\/money$/],
      ],
    ],
    [
      "/habits",
      "Personal sections",
      [
        ["School", /\/school/],
        ["Second Brain", /\/notes/],
        ["Health & habits", /\/habits/],
      ],
    ],
  ] as const;
  for (const [start, nav, items] of groups) {
    await page.goto(start);
    for (const [label, url] of items) {
      await page.getByRole("navigation", { name: nav }).getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("navigation", { name: nav }).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  }
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
