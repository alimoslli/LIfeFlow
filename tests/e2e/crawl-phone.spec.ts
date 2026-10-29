import { expect, test } from "@playwright/test";
import { signUp, openQuickAdd } from "./helpers";

// Words that mean a value leaked through unformatted.
const BAD = /\b(undefined|null|NaN)\b|Invalid Date|\[object Object\]/;

const ROUTES = [
  "/",
  "/plan",
  "/tasks",
  "/calendar",
  "/school",
  "/work",
  "/notes",
  "/money",
  "/money/coach",
  "/money/report",
  "/finances/transactions",
  "/finances/budgets",
  "/finances/goals",
  "/finances/bills",
  "/finances/accounts",
  "/finances/rules",
  "/wealth",
  "/jarvis",
  "/settings",
  "/jarvis/memory",
  "/settings/profile",
  "/settings/jarvis",
  "/settings/notifications",
  "/settings/integrations",
  "/settings/data",
  "/settings/security",
  "/settings/trash",
];

test("every screen on a new account: no undefined/null/NaN, no sideways scroll, no crash, no script errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  await signUp(page, "Cora Crawl");
  // One to-do so its detail page is covered too.
  await page.goto("/tasks");
  await openQuickAdd(page);
  await page.getByRole("dialog", { name: "Quick add" }).getByLabel("What do you need to do?").fill("Check every screen");
  await page.getByRole("dialog", { name: "Quick add" }).getByRole("button", { name: "Add to-do" }).click();
  const detail = await page.getByRole("link", { name: /Check every screen/ }).getAttribute("href");

  for (const route of [...ROUTES, detail!]) {
    const res = await page.goto(route);
    expect(res?.ok(), route).toBe(true);
    const text = await page.locator("main").innerText();
    expect(text, route).not.toMatch(BAD);
    expect(text, route).not.toMatch(/Something went wrong|Application error/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route} scrolls sideways`).toBe(true);
  }
  expect(errors).toEqual([]);
});
