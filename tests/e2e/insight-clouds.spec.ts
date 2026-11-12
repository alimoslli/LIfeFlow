import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";
import { seedBusyStudent } from "./insight-seed";

/**
 * Insight clouds on a laptop (owner, 2026-11-12): the same real insights beside the chat bar, as weather, one swipeable row.
 * A tap on an asking cloud fills the bar and sends nothing; a tap on a fix does it and shows Undo.
 */
const row = (page: import("@playwright/test").Page) => page.locator('[aria-label="Ideas to try"]:visible').first();

test("a busy student on a laptop: real insights, a tap fills the bar, a fix has Undo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email);
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();

  const said = (await row(page).locator(".lf-idea-head").allInnerTexts()).map((t) => t.trim());
  expect(said.length).toBeLessThanOrEqual(3);
  expect(said[0]).toMatch(/^Rent \$850 due \w+, you have \$620$/);
  expect(said.join(" | ")).not.toMatch(/did you know|assistant|\bAI\b|—|missed|behind|slipping/i);
  await expect(row(page).locator(".lf-idea-cloud").first()).toHaveAttribute("data-weather", "storm");

  // the clouds stand above the bar, never on it
  const bar = page.locator('form[data-tour="skyling"]:visible').first();
  const barTop = (await bar.boundingBox())!.y;
  const first = (await row(page).locator(".lf-idea-cloud").first().boundingBox())!;
  expect(first.y + first.height).toBeLessThanOrEqual(barTop + 0.5);

  if (process.env.INSIGHT_SHOTS) {
    mkdirSync("docs/design/2026-11-12-insight-clouds", { recursive: true });
    await page.screenshot({ path: "docs/design/2026-11-12-insight-clouds/laptop-busy-student.png" });
  }

  // an asking cloud fills the bar, and nothing is sent
  await row(page)
    .getByRole("button", { name: /Quiz 2 due/ })
    .click();
  await expect(page.locator('textarea[aria-label="Message Ray"]:visible').first()).toHaveValue(/^Help me finish Quiz 2/);
  await expect(page.locator(".lf-bubble-me")).toHaveCount(0);

  // the fix: one tap, what changed, Undo
  await row(page)
    .getByRole("button", { name: /Remind me to cover it/ })
    .click();
  await expect(row(page).getByText(/Added the to-do "Cover Rent/)).toBeVisible();
  expect(await queryAsUser(email, "select title from tasks where title like 'Cover Rent%'")).toHaveLength(1);
  await row(page).getByRole("button", { name: /Undo/ }).click();
  await expect(row(page).getByText("Undone.")).toBeVisible();
  expect(await queryAsUser(email, "select title from tasks where title like 'Cover Rent%'")).toHaveLength(0);
});

test("a laptop with the Money lock on shows no money insight", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email, { locked: true });
  await page.goto("/");
  await expect(row(page).getByRole("button").first()).toBeVisible();
  expect(await row(page).innerText()).not.toMatch(/\$|Rent|available|bill|spent|checking|savings/i);
});

test("a new account on a laptop: calm white tips, never an empty sky", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, "Cleo Cloud");
  await page.goto("/");
  await expect(row(page).getByRole("button")).toHaveCount(2);
  await expect(row(page).locator(".lf-idea-cloud").first()).toHaveAttribute("data-weather", "tip");
});
