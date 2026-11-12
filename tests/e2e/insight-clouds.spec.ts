import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";
import { seedBusyStudent } from "./insight-seed";

/**
 * Insight clouds on a laptop, the same as a phone (owner, 2026-11-12: "i want the same for laptop and mobile"): one big
 * cloud at a time under the sky, sized for a wide screen (never edge to edge), the skyling's thought first; a dot, a swipe
 * or the arrow keys bring the next, with the keyboard's place always visible. A tap on an asking cloud fills the bar and
 * sends nothing; a tap on a fix does it and shows Undo.
 */
const row = (page: Page) => page.locator('[aria-label="Ideas to try"]:visible').first();
const dots = (page: Page) => page.getByRole("button", { name: /^Idea \d of \d$/ });
const shown = (page: Page) => row(page).locator("li[data-on]");
/** Bring the cloud that says `text` forward with its dot. */
async function bring(page: Page, text: RegExp) {
  const at = await row(page)
    .locator("li")
    .evaluateAll((els, src) => els.findIndex((e) => new RegExp(src).test(e.textContent ?? "")), text.source);
  await dots(page).nth(at).click();
  await expect(shown(page)).toContainText(text);
}

test("a busy student on a laptop: one big cloud, the next by dot or arrow key, a tap fills the bar, a fix has Undo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const email = await signUp(page, "Maya Torres");
  await seedBusyStudent(email);
  await page.goto("/");
  await expect(shown(page)).toHaveCount(1);

  const said = (await row(page).locator(".lf-idea-head").allInnerTexts()).map((t) => t.trim());
  expect(said.length).toBeLessThanOrEqual(3);
  expect(said[0]).toMatch(/^Rent \$850 due \w+, \$230 short$/);
  expect(said.join(" | ")).not.toMatch(/did you know|assistant|\bAI\b|—|missed|behind|slipping/i);
  await expect(row(page).locator(".lf-idea-cloud").first()).toHaveAttribute("data-weather", "storm");
  // only the bar on screen holds the chat: the small row of clouds by the bar is gone
  await expect(page.locator('form[data-tour="skyling"]:visible .lf-idea-row')).toHaveCount(0);

  // sized for a wide screen: nearly the sky's width, never edge to edge, and never over the bar
  const cloud = (await shown(page).locator(".lf-idea-cloud").boundingBox())!;
  expect(cloud.width).toBeGreaterThanOrEqual(420);
  expect(cloud.width).toBeLessThanOrEqual(640);
  const bar = (await page.locator('form[data-tour="skyling"]:visible').first().boundingBox())!;
  const apart = cloud.y + cloud.height <= bar.y || bar.y + bar.height <= cloud.y || cloud.x + cloud.width <= bar.x || bar.x + bar.width <= cloud.x;
  expect(apart, "the cloud never lies over the chat bar").toBe(true);

  // the keyboard: a dot takes focus with a visible ring, and the arrow keys move to the next and back
  await dots(page).nth(0).focus();
  expect(
    await dots(page)
      .nth(0)
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  await page.keyboard.press("ArrowRight");
  await expect(dots(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(shown(page)).toContainText(said[1]);
  await page.keyboard.press("ArrowLeft");
  await expect(dots(page).nth(0)).toHaveAttribute("aria-current", "true");

  if (process.env.INSIGHT_SHOTS) {
    mkdirSync("docs/design/2026-11-12-insight-clouds", { recursive: true });
    await page.screenshot({ path: "docs/design/2026-11-12-insight-clouds/laptop-busy-student.png" });
  }

  // an asking cloud fills the bar, and nothing is sent
  await bring(page, /Quiz 2 due/);
  await shown(page)
    .getByRole("button", { name: /Quiz 2 due/ })
    .click();
  const box = page.locator('textarea[aria-label="Message Ray"]:visible').first();
  await expect(box).toHaveValue(/^Help me finish Quiz 2/);
  await expect(page.locator(".lf-bubble-me")).toHaveCount(0);
  await box.fill("");
  await box.blur();

  // the fix: one tap, what changed, Undo
  await bring(page, /Remind me to cover it/);
  await shown(page)
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
  await expect(shown(page)).toHaveCount(1);
  expect(await row(page).innerText()).not.toMatch(/\$|Rent|available|bill|spent|checking|savings/i);
});

test("a new account on a laptop: calm white tips, never an empty sky", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, "Cleo Cloud");
  await page.goto("/");
  await expect(row(page).getByRole("button")).toHaveCount(2);
  await expect(shown(page)).toHaveCount(1);
  await expect(row(page).locator(".lf-idea-cloud").first()).toHaveAttribute("data-weather", "tip");
});
